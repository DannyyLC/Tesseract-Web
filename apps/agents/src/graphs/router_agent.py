"""
Router Agent - Clasificación de intención + enrutamiento a agente especializado

PATRÓN ROUTER:
1. Un agente clasificador analiza el mensaje del usuario con un LLM ligero
2. La intención detectada se guarda en state.intent
3. Un conditional edge enruta al agente especializado correspondiente
4. El agente especializado ejecuta con sus propias tools y system prompt (patrón ReAct)

DIFERENCIA VS PIPELINE:
- Router:    clasificación automática por LLM → agente especializado completo (con loop ReAct)
- Pipeline:  flujo explícito definido en config, nodos más granulares, sin agentes con tools

DIFERENCIA VS REACT:
- Router:    múltiples agentes especializados, solo uno se activa según la intención
- ReAct:     un solo agente generalista que usa todas sus tools para resolver cualquier cosa

CASOS DE USO:
- Bot omnicanal: ventas / soporte / facturación / RRHH en el mismo número
- Asistente que detecta idioma y enruta al agente correcto
- Sistema que separa intenciones técnicas de comerciales
- Cualquier escenario con usuarios que tienen necesidades radicalmente distintas

CONFIGURACIÓN ESPERADA EN graph_config:
{
  "type": "router",
  "classifier_agent": "classifier",    # Clave en agents_config para el clasificador
  "routes": {
    "ventas":   "sales",               # intent_label → nombre de agente en agents_config
    "soporte":  "support",
    "factura":  "billing",
    "default":  "default"              # Fallback obligatorio cuando no hay match exacto
  },
  "max_iterations": 10                 # Máximo de iteraciones del loop ReAct de los agentes destino
}

NOTAS DE DISEÑO:
- El clasificador debe devolver ÚNICAMENTE la etiqueta de intención (ej: "ventas")
  Su system_prompt debe instruirlo explícitamente a responder solo con la etiqueta.
- Los agentes destino se inicializan al construir el grafo para evitar latencia en runtime.
- Cada agente destino es un loop ReAct completo con sus propias tools.
"""

import logging
from typing import Annotated, Any, Dict, Literal

from langgraph.graph import StateGraph, END, START
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langchain_core.messages import AIMessage, SystemMessage, HumanMessage
from typing_extensions import TypedDict
from datetime import datetime
import pytz

from core.context import TenantContext
from tools.registry import get_llm, load_tools

logger = logging.getLogger(__name__)


# =============================================================================
# ESTADO DEL GRAFO
# =============================================================================

class RouterAgentState(TypedDict):
    """
    Estado del Router Agent.

    Campos:
        messages:        Historial de mensajes de la conversación.
        intent:          Etiqueta de intención detectada por el clasificador.
                         Ejemplo: "ventas", "soporte", "default"
        variables:       Bus de datos auxiliar para metadata del routing.
        iteration_count: Contador de seguridad del loop ReAct de los agentes destino.
    """
    messages: Annotated[list, add_messages]
    intent: str
    variables: Dict[str, Any]
    iteration_count: int


# =============================================================================
# NODO CLASIFICADOR
# =============================================================================

def _make_classifier_node(classifier_agent: str, valid_intents: list[str], ctx: TenantContext):
    """
    Crea el nodo clasificador que detecta la intención del usuario.

    El LLM clasificador recibe el historial de mensajes y debe responder
    ÚNICAMENTE con una de las etiquetas de intención válidas.

    Su system_prompt en agents_config debe instruirlo explícitamente, por ejemplo:
        "Clasifica la intención del usuario. Responde ÚNICAMENTE con una de estas
         opciones: ventas, soporte, factura. Sin explicaciones, solo la palabra."

    Args:
        classifier_agent: Clave en agents_config del agente clasificador
        valid_intents:    Lista de etiquetas válidas (keys de routes, sin "default")
        ctx:              TenantContext con toda la configuración
    """
    llm = get_llm(ctx, classifier_agent)
    agent_config = ctx.get_agent_config(classifier_agent)

    logger.info(
        f"[{ctx.workflow_id}] Router classifier node initialized "
        f"(agent: {classifier_agent}, valid intents: {valid_intents})"
    )

    def node(state: RouterAgentState) -> dict:
        messages = list(state["messages"])
        base_system_prompt = agent_config.get("system_prompt", "")

        # Inyectar contexto de tiempo actual
        try:
            local_tz = pytz.timezone(ctx.timezone)
        except pytz.UnknownTimeZoneError:
            local_tz = pytz.UTC

        current_time = datetime.now(local_tz)
        time_context = (
            f"\n---\n"
            f"SYSTEM DYNAMIC CONTEXT:\n"
            f"Today's Date: {current_time.strftime('%A, %B %d, %Y')}\n"
            f"Current Local Time: {current_time.strftime('%I:%M %p')} (Timezone: {ctx.timezone})\n"
            f"Valid intents: {', '.join(valid_intents)}\n"
            f"---\n"
        )

        system_prompt = base_system_prompt + time_context if base_system_prompt else time_context

        if system_prompt:
            if not messages or messages[0].type != "system":
                messages = [SystemMessage(content=system_prompt)] + messages
            else:
                messages[0] = SystemMessage(content=system_prompt)

        logger.info(f"[{ctx.workflow_id}] Classifier calling LLM ({classifier_agent})")

        try:
            response = llm.invoke(messages)
            detected_intent = response.content.strip().lower()

            # Verificar si la intent es válida
            if detected_intent not in valid_intents:
                logger.warning(
                    f"[{ctx.workflow_id}] Classifier returned unknown intent '{detected_intent}'. "
                    f"Valid: {valid_intents}. Falling back to 'default'."
                )
                detected_intent = "default"

            logger.info(
                f"[{ctx.workflow_id}] Classifier detected intent: '{detected_intent}'"
            )

        except Exception as e:
            logger.error(
                f"[{ctx.workflow_id}] Classifier LLM error: {e}. Falling back to 'default'.",
                exc_info=True
            )
            detected_intent = "default"

        return {
            "intent": detected_intent,
            "variables": {**state.get("variables", {}), "detected_intent": detected_intent},
        }

    return node


# =============================================================================
# NODO AGENTE DESTINO (loop ReAct)
# =============================================================================

def _make_destination_node(agent_name: str, ctx: TenantContext):
    """
    Crea el nodo de llamada al LLM dentro del loop ReAct del agente destino.

    Args:
        agent_name: Clave en agents_config del agente especializado
        ctx:        TenantContext con toda la configuración
    """
    llm = get_llm(ctx, agent_name)
    tools = load_tools(ctx, agent_name)
    llm_with_tools = llm.bind_tools(tools) if tools else llm
    agent_config = ctx.get_agent_config(agent_name)

    logger.info(
        f"[{ctx.workflow_id}] Router destination agent '{agent_name}' initialized "
        f"({len(tools)} tools)"
    )

    def node(state: RouterAgentState) -> dict:
        messages = list(state["messages"])
        base_system_prompt = agent_config.get("system_prompt", "")

        try:
            local_tz = pytz.timezone(ctx.timezone)
        except pytz.UnknownTimeZoneError:
            local_tz = pytz.UTC

        current_time = datetime.now(local_tz)
        time_context = (
            f"\n---\n"
            f"SYSTEM DYNAMIC CONTEXT:\n"
            f"Today's Date: {current_time.strftime('%A, %B %d, %Y')}\n"
            f"Current Local Time: {current_time.strftime('%I:%M %p')} (Timezone: {ctx.timezone})\n"
            f"---\n"
        )

        system_prompt = base_system_prompt + time_context if base_system_prompt else time_context

        if system_prompt:
            if not messages or messages[0].type != "system":
                messages = [SystemMessage(content=system_prompt)] + messages
            else:
                messages[0] = SystemMessage(content=system_prompt)

        logger.info(
            f"[{ctx.workflow_id}] Destination agent '{agent_name}' calling LLM "
            f"(iteration {state.get('iteration_count', 0)})"
        )

        try:
            response = llm_with_tools.invoke(messages)

            if hasattr(response, 'tool_calls') and response.tool_calls:
                tool_names = [tc.get('name') for tc in response.tool_calls]
                logger.info(f"[{ctx.workflow_id}] Agent '{agent_name}' calling tools: {tool_names}")
            else:
                logger.info(f"[{ctx.workflow_id}] Agent '{agent_name}' provided final response")

        except Exception as e:
            logger.error(
                f"[{ctx.workflow_id}] Destination agent '{agent_name}' LLM error: {e}",
                exc_info=True
            )
            response = AIMessage(content=f"Lo siento, ocurrió un error al procesar tu solicitud: {str(e)}")

        return {"messages": [response]}

    return node, tools


# =============================================================================
# CONDITIONAL EDGES
# =============================================================================

def _make_route_condition(routes: Dict[str, str], ctx: TenantContext):
    """
    Crea la función de enrutamiento post-clasificación.

    Lee state.intent y retorna el node_id del agente destino.

    Args:
        routes: Mapa intent_label → agent_node_id (ej: {"ventas": "agent_sales"})
        ctx:    TenantContext para logging
    """
    def route_condition(state: RouterAgentState) -> str:
        intent = state.get("intent", "default")
        destination = routes.get(intent) or routes.get("default")

        if not destination:
            logger.error(
                f"[{ctx.workflow_id}] No route for intent '{intent}' and no 'default' route defined"
            )
            return END

        logger.info(
            f"[{ctx.workflow_id}] Routing intent '{intent}' → '{destination}'"
        )
        return destination

    return route_condition


def _make_react_condition(agent_node_id: str, tools_node_id: str, ctx: TenantContext):
    """
    Crea la función de decisión del loop ReAct para un agente destino específico.

    Decide si continuar al nodo de tools o terminar.

    Args:
        agent_node_id: ID del nodo agente (para loopback después de tools)
        tools_node_id: ID del nodo de tools
        ctx:           TenantContext
    """
    def should_continue(state: RouterAgentState) -> str:
        max_iterations = ctx.graph_config.get("max_iterations", 10)
        current_iteration = state.get("iteration_count", 0)

        if current_iteration >= max_iterations:
            logger.warning(
                f"[{ctx.workflow_id}] Max iterations ({max_iterations}) reached. Forcing end."
            )
            return "end"

        last_message = state["messages"][-1]
        has_tool_calls = (
            hasattr(last_message, 'tool_calls') and
            last_message.tool_calls and
            len(last_message.tool_calls) > 0
        )

        return "tools" if has_tool_calls else "end"

    return should_continue


def _increment_iteration(state: RouterAgentState) -> dict:
    """Incrementa el contador de iteraciones del loop ReAct."""
    return {"iteration_count": state.get("iteration_count", 0) + 1}


# =============================================================================
# BUILDER PRINCIPAL
# =============================================================================

def create_router_agent(ctx: TenantContext) -> StateGraph:
    """
    Construye el grafo del Router Agent desde la configuración del workflow.

    Estructura del grafo:

        START
          ↓
        classify                         ← Detecta la intención del usuario
          ↓
        route_condition (conditional)    ← Enruta según state.intent
          ├─→ agent_ventas → [tools_ventas ↔ increment ↔ agent_ventas] → END
          ├─→ agent_soporte → [tools_soporte ↔ increment ↔ agent_soporte] → END
          └─→ agent_default → [tools_default ↔ increment ↔ agent_default] → END

    Args:
        ctx: TenantContext con graph_config["classifier_agent"] y graph_config["routes"]

    Returns:
        StateGraph compilado y listo para ejecutar
    """
    classifier_agent = ctx.graph_config.get("classifier_agent", "classifier")
    routes_config: Dict[str, str] = ctx.graph_config.get("routes", {})

    if not routes_config:
        raise ValueError(
            f"[{ctx.workflow_id}] Router graph_config requires 'routes' mapping"
        )

    if "default" not in routes_config:
        raise ValueError(
            f"[{ctx.workflow_id}] Router graph_config 'routes' must include a 'default' fallback"
        )

    # Obtener los agentes destino únicos (puede haber múltiples intents → mismo agente)
    destination_agents = list(set(routes_config.values()))
    valid_intents = [k for k in routes_config.keys() if k != "default"]

    logger.info(
        f"[{ctx.workflow_id}] Building router graph: "
        f"classifier='{classifier_agent}', routes={routes_config}"
    )

    graph = StateGraph(RouterAgentState)

    # =========================================================================
    # 1. Nodo clasificador
    # =========================================================================
    graph.add_node("classify", _make_classifier_node(classifier_agent, valid_intents + ["default"], ctx))

    # =========================================================================
    # 2. Nodos destino (uno por agente único en routes)
    #    Cada agente destino tiene su propio loop ReAct con tools
    # =========================================================================
    # Mapa de agent_name → node_id para construir las rutas
    agent_to_node: Dict[str, str] = {}
    # Mapa intent → node_id del agente destino
    intent_to_node: Dict[str, str] = {}

    for intent, agent_name in routes_config.items():
        node_id = f"agent_{agent_name}"
        tools_node_id = f"tools_{agent_name}"
        increment_node_id = f"increment_{agent_name}"

        # Registrar mapeos
        agent_to_node[agent_name] = node_id
        intent_to_node[intent] = node_id

        # Solo crear el nodo si no existe ya (múltiples intents pueden → mismo agente)
        if node_id not in [n for n in graph.nodes if hasattr(graph, 'nodes')]:
            destination_fn, tools = _make_destination_node(agent_name, ctx)
            graph.add_node(node_id, destination_fn)
            graph.add_node(increment_node_id, _increment_iteration)

            if tools:
                graph.add_node(tools_node_id, ToolNode(tools))

                # Loop ReAct: agent → should_continue → tools → increment → agent
                graph.add_conditional_edges(
                    node_id,
                    _make_react_condition(node_id, tools_node_id, ctx),
                    {"tools": tools_node_id, "end": END}
                )
                graph.add_edge(tools_node_id, increment_node_id)
                graph.add_edge(increment_node_id, node_id)
            else:
                # Sin tools: agente directo a END
                graph.add_edge(node_id, END)
                logger.warning(
                    f"[{ctx.workflow_id}] Destination agent '{agent_name}' has no tools. "
                    f"Will respond without tool calling."
                )

            logger.debug(
                f"[{ctx.workflow_id}] Added destination agent node: '{node_id}' "
                f"(intent(s): {[i for i, a in routes_config.items() if a == agent_name]})"
            )

    # =========================================================================
    # 3. Aristas
    # =========================================================================
    graph.add_edge(START, "classify")

    # Conditional edge post-clasificación: classify → agente destino según intent
    graph.add_conditional_edges(
        "classify",
        _make_route_condition(intent_to_node, ctx),
    )

    # =========================================================================
    # 4. Compilar
    # =========================================================================
    compiled = graph.compile()

    logger.info(
        f"[{ctx.workflow_id}] Router graph compiled successfully. "
        f"Routes: {routes_config}"
    )

    return compiled
