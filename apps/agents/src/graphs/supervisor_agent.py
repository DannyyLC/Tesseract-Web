"""
Supervisor Agent - Supervisor que orquesta múltiples agentes trabajadores

PATRÓN SUPERVISOR:
1. El supervisor (LLM) analiza el estado de la conversación y decide qué worker llamar
2. El worker seleccionado ejecuta su tarea con sus propias tools (loop ReAct interno)
3. El resultado del worker se agrega al historial de mensajes
4. Control regresa al supervisor para la siguiente decisión
5. El supervisor repite hasta emitir "FINISH" cuando considera que la tarea está completa

DIFERENCIA VS REACT:
- ReAct:      un solo agente + sus tools en loop (todo dentro del mismo LLM)
- Supervisor: un coordinador LLM + múltiples agentes especializados cada uno con sus tools

DIFERENCIA VS PIPELINE:
- Pipeline:   flujo determinista definido en config (el desarrollador decide el orden)
- Supervisor: flujo dinámico decidido en runtime por el supervisor LLM (el LLM decide el orden)

DIFERENCIA VS ROUTER:
- Router:     un solo agente destino por conversación (clasificación 1-a-1)
- Supervisor: puede invocar múltiples workers en cualquier orden (coordinación N-a-N)

CASOS DE USO:
- Research: supervisor coordina researcher → fact_checker → writer → editor
- Customer support: supervisor coordina intent_agent → crm_agent → billing_agent
- Code review: supervisor coordina analyzer → security_checker → formatter
- Sales: supervisor coordina qualifier → product_matcher → proposal_writer
- Cualquier tarea compleja que requiere múltiples especialistas en orden dinámico

CONFIGURACIÓN ESPERADA EN graph_config:
{
  "type": "supervisor",
  "supervisor_agent": "supervisor",              # Clave en agents_config para el supervisor
  "worker_agents": ["researcher", "writer"],     # Claves en agents_config para los workers
  "max_iterations": 15                           # Límite total de llamadas a workers (safety)
}

PROTOCOLO DE COMUNICACIÓN CON EL SUPERVISOR:
El supervisor LLM recibe el historial completo de mensajes más una instrucción
para decidir qué hacer a continuación. Debe responder con un JSON:
    {"next": "researcher"}    → llamar al worker "researcher"
    {"next": "FINISH"}        → la tarea está completa, terminar

Su system_prompt en agents_config debe describirle su rol de coordinador.
El sistema inyecta automáticamente la lista de workers disponibles y el protocolo.

NOTAS DE DISEÑO:
- Los workers son loops ReAct completos con sus propias tools
- El supervisor ve TODO el historial (mensajes de workers incluidos)
- Si el supervisor falla al parsear, se aborta con FINISH para evitar loops
- El estado `next` se limpia entre iteraciones (se sobreescribe, no acumula)
"""

import json
import logging
from typing import Annotated, Any, Dict, List

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

# Constante para señalizar fin de tarea
FINISH = "FINISH"


# =============================================================================
# ESTADO DEL GRAFO
# =============================================================================

class SupervisorAgentState(TypedDict):
    """
    Estado compartido entre el supervisor y todos los workers.

    Campos:
        messages:        Historial completo de mensajes.
                         El supervisor y los workers comparten y acumulan aquí.
        next:            Decisión del supervisor: nombre del worker a llamar o "FINISH".
                         Este campo se sobreescribe en cada iteración del supervisor.
        variables:       Bus de datos auxiliar para metadata y datos estructurados.
        iteration_count: Contador de iteraciones (llamadas a workers) para safety.
        execution_path:  Secuencia de workers llamados en esta ejecución (para debugging).
    """
    messages: Annotated[list, add_messages]
    next: str
    variables: Dict[str, Any]
    iteration_count: int
    execution_path: List[str]


# =============================================================================
# PARSEO DE DECISIÓN DEL SUPERVISOR
# =============================================================================

def _parse_supervisor_decision(content: str, available_workers: List[str], workflow_id: str) -> str:
    """
    Parsea la decisión del supervisor desde el contenido del LLM.

    Intenta parsear JSON primero. Si falla, busca coincidencias de texto.
    Si no puede determinar una decisión válida, retorna FINISH para evitar loops.

    Args:
        content:           Contenido de la respuesta del supervisor LLM
        available_workers: Lista de nombres de workers válidos
        workflow_id:       Para logging

    Returns:
        Nombre del worker a llamar, o "FINISH"

    Ejemplos de contenido aceptado:
        '{"next": "researcher"}'  → "researcher"
        '{"next": "FINISH"}'      → "FINISH"
        'researcher'              → "researcher" (coincidencia directa)
        'Llamar a researcher...'  → "researcher" (coincidencia parcial)
    """
    content = content.strip()
    valid_options = available_workers + [FINISH]

    # ── 1. Intentar parsear JSON ──────────────────────────────────────────────
    try:
        # Extraer bloque JSON si viene dentro de texto (ej: ```json\n{...}\n```)
        json_start = content.find("{")
        json_end = content.rfind("}") + 1
        if json_start != -1 and json_end > json_start:
            json_str = content[json_start:json_end]
            data = json.loads(json_str)
            next_val = str(data.get("next", "")).strip()
            if next_val in valid_options:
                logger.debug(f"[{workflow_id}] Supervisor JSON decision: '{next_val}'")
                return next_val
    except (json.JSONDecodeError, AttributeError, ValueError):
        pass

    # ── 2. Coincidencia directa (sin JSON) ───────────────────────────────────
    for option in valid_options:
        if content.lower() == option.lower():
            logger.debug(f"[{workflow_id}] Supervisor direct match: '{option}'")
            return option

    # ── 3. Coincidencia parcial en el texto ──────────────────────────────────
    for option in valid_options:
        if option.lower() in content.lower():
            logger.debug(f"[{workflow_id}] Supervisor partial match: '{option}'")
            return option

    # ── 4. Fallback seguro ───────────────────────────────────────────────────
    logger.warning(
        f"[{workflow_id}] Could not parse supervisor decision from: '{content[:200]}'. "
        f"Valid options: {valid_options}. Defaulting to FINISH."
    )
    return FINISH


# =============================================================================
# NODO SUPERVISOR
# =============================================================================

def _make_supervisor_node(supervisor_agent: str, worker_names: List[str], ctx: TenantContext):
    """
    Crea el nodo supervisor que decide qué worker llamar a continuación.

    El supervisor recibe:
    - Todo el historial de mensajes (incluyendo outputs de workers anteriores)
    - Una instrucción explícita para decidir el siguiente paso

    Y debe responder con:
    - {"next": "worker_name"} para delegar al worker
    - {"next": "FINISH"} para terminar

    Args:
        supervisor_agent: Clave en agents_config del supervisor
        worker_names:     Lista de nombres de workers disponibles
        ctx:              TenantContext
    """
    llm = get_llm(ctx, supervisor_agent)
    agent_config = ctx.get_agent_config(supervisor_agent)

    logger.info(
        f"[{ctx.workflow_id}] Supervisor node initialized "
        f"(agent: {supervisor_agent}, workers: {worker_names})"
    )

    # Construir instrucción de protocolo inyectada automáticamente
    workers_list = ", ".join(worker_names)
    protocol_instruction = (
        f"\n---\n"
        f"SUPERVISOR PROTOCOL:\n"
        f"Available workers: {workers_list}\n"
        f"Based on the conversation so far, decide who should act next.\n"
        f"Respond ONLY with a JSON object: {{\"next\": \"worker_name\"}} or {{\"next\": \"FINISH\"}}\n"
        f"Use FINISH when the task is complete and the user has a satisfactory response.\n"
        f"---\n"
    )

    def node(state: SupervisorAgentState) -> dict:
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

        # System prompt = rol del supervisor + contexto de tiempo + protocolo
        full_system_prompt = base_system_prompt + time_context + protocol_instruction

        if not messages or messages[0].type != "system":
            messages = [SystemMessage(content=full_system_prompt)] + messages
        else:
            messages[0] = SystemMessage(content=full_system_prompt)

        iteration = state.get("iteration_count", 0)
        logger.info(
            f"[{ctx.workflow_id}] Supervisor deciding next step "
            f"(iteration {iteration}, {len(messages)} messages)"
        )

        try:
            response = llm.invoke(messages)
            decision = _parse_supervisor_decision(response.content, worker_names, ctx.workflow_id)
        except Exception as e:
            logger.error(
                f"[{ctx.workflow_id}] Supervisor LLM error: {e}. Forcing FINISH.",
                exc_info=True
            )
            decision = FINISH

        logger.info(f"[{ctx.workflow_id}] Supervisor decision: '{decision}'")

        return {
            "next": decision,
            "variables": {**state.get("variables", {}), "last_supervisor_decision": decision},
        }

    return node


# =============================================================================
# NODO WORKER (loop ReAct interno)
# =============================================================================

def _make_worker_node(worker_name: str, ctx: TenantContext):
    """
    Crea el nodo principal del worker (llamada al LLM con tools).

    El worker es un agente ReAct con sus propias tools. Su output se agrega
    al historial compartido para que el supervisor y otros workers lo vean.

    Args:
        worker_name: Clave en agents_config del worker
        ctx:         TenantContext
    """
    llm = get_llm(ctx, worker_name)
    tools = load_tools(ctx, worker_name)
    llm_with_tools = llm.bind_tools(tools) if tools else llm
    agent_config = ctx.get_agent_config(worker_name)

    logger.info(
        f"[{ctx.workflow_id}] Worker node '{worker_name}' initialized "
        f"({len(tools)} tools)"
    )

    def node(state: SupervisorAgentState) -> dict:
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
            f"Your role: {worker_name}\n"
            f"---\n"
        )

        system_prompt = base_system_prompt + time_context if base_system_prompt else time_context

        if not messages or messages[0].type != "system":
            messages = [SystemMessage(content=system_prompt)] + messages
        else:
            messages[0] = SystemMessage(content=system_prompt)

        logger.info(f"[{ctx.workflow_id}] Worker '{worker_name}' calling LLM")

        try:
            response = llm_with_tools.invoke(messages)

            if hasattr(response, 'tool_calls') and response.tool_calls:
                tool_names = [tc.get('name') for tc in response.tool_calls]
                logger.info(f"[{ctx.workflow_id}] Worker '{worker_name}' calling tools: {tool_names}")
            else:
                logger.info(f"[{ctx.workflow_id}] Worker '{worker_name}' provided response")

        except Exception as e:
            logger.error(
                f"[{ctx.workflow_id}] Worker '{worker_name}' LLM error: {e}",
                exc_info=True
            )
            response = AIMessage(content=f"Error en worker {worker_name}: {str(e)}")

        return {
            "messages": [response],
            "execution_path": list(state.get("execution_path", [])) + [worker_name],
            "iteration_count": state.get("iteration_count", 0) + 1,
        }

    return node, tools


def _make_worker_tool_condition(worker_tools_node_id: str, ctx: TenantContext):
    """
    Crea la función de decisión del loop ReAct interno de un worker.

    Returns:
        "tools" si el worker quiere llamar tools, "supervisor" si terminó
    """
    def should_continue(state: SupervisorAgentState) -> str:
        last_message = state["messages"][-1]
        has_tool_calls = (
            hasattr(last_message, 'tool_calls') and
            last_message.tool_calls and
            len(last_message.tool_calls) > 0
        )
        return "tools" if has_tool_calls else "supervisor"

    return should_continue


# =============================================================================
# CONDITIONAL EDGE DEL SUPERVISOR
# =============================================================================

def _make_supervisor_condition(worker_node_ids: Dict[str, str], ctx: TenantContext):
    """
    Crea la función de enrutamiento post-supervisor.

    Lee state.next y retorna el node_id del worker a llamar o END.

    Args:
        worker_node_ids: Mapa worker_name → node_id (ej: {"researcher": "worker_researcher"})
        ctx:             TenantContext
    """
    def route(state: SupervisorAgentState) -> str:
        next_val = state.get("next", FINISH)

        if next_val == FINISH:
            logger.info(f"[{ctx.workflow_id}] Supervisor signaled FINISH → END")
            return END

        node_id = worker_node_ids.get(next_val)
        if not node_id:
            logger.error(
                f"[{ctx.workflow_id}] Supervisor chose unknown worker '{next_val}'. "
                f"Available: {list(worker_node_ids.keys())}. Forcing END."
            )
            return END

        return node_id

    return route


# =============================================================================
# BUILDER PRINCIPAL
# =============================================================================

def create_supervisor_agent(ctx: TenantContext) -> StateGraph:
    """
    Construye el grafo del Supervisor Agent desde la configuración del workflow.

    Estructura del grafo:

        START
          ↓
        supervisor ──────────────────────────────────────────────── "FINISH" → END
          ↓ "researcher"      ↓ "writer"      ↓ "fact_checker"
        worker_researcher   worker_writer   worker_fact_checker
          ↓ (tools loop)      ↓ (tools loop)  ↓ (tools loop)
          └─────────────────────────────────────────────────────── → supervisor

    Args:
        ctx: TenantContext con graph_config["supervisor_agent"] y graph_config["worker_agents"]

    Returns:
        StateGraph compilado y listo para ejecutar

    Ejemplo de invocación:
        graph = create_supervisor_agent(ctx)
        result = graph.invoke({
            "messages": [HumanMessage("Investiga y escribe un resumen sobre LangGraph")],
            "next": "",
            "variables": {},
            "iteration_count": 0,
            "execution_path": []
        })
    """
    supervisor_agent = ctx.graph_config.get("supervisor_agent", "supervisor")
    worker_names: List[str] = ctx.graph_config.get("worker_agents", [])
    max_iterations = ctx.graph_config.get("max_iterations", 15)

    if not worker_names:
        raise ValueError(
            f"[{ctx.workflow_id}] Supervisor graph_config requires 'worker_agents' list"
        )

    logger.info(
        f"[{ctx.workflow_id}] Building supervisor graph: "
        f"supervisor='{supervisor_agent}', workers={worker_names}, "
        f"max_iterations={max_iterations}"
    )

    graph = StateGraph(SupervisorAgentState)

    # =========================================================================
    # 1. Nodo supervisor
    # =========================================================================
    graph.add_node(
        "supervisor",
        _make_supervisor_node(supervisor_agent, worker_names, ctx)
    )

    # =========================================================================
    # 2. Nodos workers con sus loops ReAct internos
    # =========================================================================
    # Mapa worker_name → node_id (para el conditional edge del supervisor)
    worker_node_ids: Dict[str, str] = {}

    for worker_name in worker_names:
        worker_node_id = f"worker_{worker_name}"
        tools_node_id = f"tools_{worker_name}"
        worker_node_ids[worker_name] = worker_node_id

        worker_fn, tools = _make_worker_node(worker_name, ctx)
        graph.add_node(worker_node_id, worker_fn)

        if tools:
            # Loop ReAct interno del worker: worker → [tools → worker] → supervisor
            graph.add_node(tools_node_id, ToolNode(tools))

            graph.add_conditional_edges(
                worker_node_id,
                _make_worker_tool_condition(tools_node_id, ctx),
                {
                    "tools": tools_node_id,       # Worker quiere llamar tools
                    "supervisor": "supervisor",    # Worker terminó su tarea
                }
            )
            graph.add_edge(tools_node_id, worker_node_id)
        else:
            # Sin tools: el worker va directo de vuelta al supervisor
            graph.add_edge(worker_node_id, "supervisor")
            logger.warning(
                f"[{ctx.workflow_id}] Worker '{worker_name}' has no tools. "
                f"Will respond without tool calling capability."
            )

        logger.debug(f"[{ctx.workflow_id}] Added worker node: '{worker_node_id}'")

    # =========================================================================
    # 3. Safety: wrapper del supervisor para respetar max_iterations
    # =========================================================================
    # Wrappear el conditional edge del supervisor con un check de iteraciones
    supervisor_condition = _make_supervisor_condition(worker_node_ids, ctx)

    def supervisor_condition_with_safety(state: SupervisorAgentState) -> str:
        if state.get("iteration_count", 0) >= max_iterations:
            logger.warning(
                f"[{ctx.workflow_id}] Max iterations ({max_iterations}) reached. "
                f"Forcing END."
            )
            return END
        return supervisor_condition(state)

    # =========================================================================
    # 4. Aristas
    # =========================================================================
    graph.add_edge(START, "supervisor")

    # Conditional edge del supervisor: decide a qué worker ir o END
    graph.add_conditional_edges(
        "supervisor",
        supervisor_condition_with_safety,
    )

    # =========================================================================
    # 5. Compilar
    # =========================================================================
    compiled = graph.compile()

    logger.info(
        f"[{ctx.workflow_id}] Supervisor graph compiled successfully. "
        f"Workers: {worker_names}"
    )

    return compiled
