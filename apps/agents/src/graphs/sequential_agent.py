"""
Sequential Agent - Cadena lineal de agentes

PATRÓN SEQUENTIAL:
- Los agentes se ejecutan en orden fijo y predecible: paso 1 → paso 2 → paso 3 → END
- Cada paso es una llamada al LLM con su propio system prompt y rol
- El historial de mensajes se acumula entre pasos: cada agente "ve" lo que dijeron los anteriores
- Opcionalmente, cada paso puede guardar su respuesta en state.variables como datos estructurados

DIFERENCIA VS PIPELINE:
- Sequential: flujo siempre lineal, sin condiciones ni bifurcaciones, configuración mínima
- Pipeline:   flujo configurable con condiciones, bifurcaciones y nodos de tipo tool

DIFERENCIA VS REACT:
- Sequential: múltiples agentes con roles específicos que ejecutan en orden fijo
- ReAct:      un solo agente generalista que razona y usa tools en loop dinámico

CASOS DE USO:
- Extracción → Enriquecimiento → Respuesta al usuario
- Clasificación → Validación → Formateo → Envío
- Research → Análisis → Resumen ejecutivo → Presentación
- Cualquier pipeline donde cada etapa tiene un rol diferente y bien definido

CONFIGURACIÓN ESPERADA EN graph_config:
{
  "type": "sequential",
  "steps": [
    {
      "agent": "extractor",              # Clave en agents_config
      "output_variable": "raw_data"      # Opcional: guarda la respuesta en state.variables
    },
    {
      "agent": "analyzer",
      "output_variable": "analysis"
    },
    {
      "agent": "responder"               # Último paso: genera la respuesta final al usuario
    }
  ]
}

CÓMO FLUYEN LOS DATOS:
- state.messages: historial completo acumulado — cada agente lee el contexto de los anteriores
- state.variables: bus de datos estructurados — accesible desde system prompts o para logging
- El Gateway toma el último mensaje del historial como respuesta final
"""

import logging
from typing import Annotated, Any, Dict, List

from langgraph.graph import StateGraph, END, START
from langgraph.graph.message import add_messages
from langchain_core.messages import AIMessage, SystemMessage
from typing_extensions import TypedDict
from datetime import datetime
import pytz

from core.context import TenantContext
from tools.registry import get_llm

logger = logging.getLogger(__name__)


# =============================================================================
# ESTADO DEL GRAFO
# =============================================================================

class SequentialAgentState(TypedDict):
    """
    Estado compartido entre todos los pasos del sequential.

    Campos:
        messages:       Historial de mensajes acumulado entre todos los pasos.
                        Cada agente puede ver los mensajes de los anteriores.
        variables:      Bus de datos entre pasos. Cada paso puede guardar
                        su respuesta aquí si tiene output_variable configurado.
        current_step:   Índice del paso que se está ejecutando (para logging).
        execution_path: Nombres de agentes ejecutados en orden (para debugging).
    """
    messages: Annotated[list, add_messages]
    variables: Dict[str, Any]
    current_step: int
    execution_path: List[str]


# =============================================================================
# FÁBRICA DE NODOS
# =============================================================================

def _make_step_node(step_index: int, agent_name: str, output_variable: str | None, ctx: TenantContext):
    """
    Crea un nodo que representa un paso en la cadena secuencial.

    El LLM se inicializa una sola vez al construir el grafo (no en cada ejecución).
    El nodo llama al LLM con el historial acumulado y opcionalmente guarda
    su respuesta en state.variables[output_variable].

    Args:
        step_index:      Posición del paso (0-based, para logging)
        agent_name:      Clave en agents_config ("extractor", "analyzer", etc)
        output_variable: Si se especifica, guarda el content de la respuesta en variables
        ctx:             TenantContext con toda la configuración
    """
    llm = get_llm(ctx, agent_name)
    agent_config = ctx.get_agent_config(agent_name)

    logger.info(
        f"[{ctx.workflow_id}] Sequential step {step_index} "
        f"(agent: {agent_name}) initialized"
    )

    def node(state: SequentialAgentState) -> dict:
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
            f"---\n"
        )

        system_prompt = base_system_prompt + time_context if base_system_prompt else time_context

        if system_prompt:
            if not messages or messages[0].type != "system":
                messages = [SystemMessage(content=system_prompt)] + messages
            else:
                messages[0] = SystemMessage(content=system_prompt)

        logger.info(
            f"[{ctx.workflow_id}] Sequential step {step_index} "
            f"calling LLM ({agent_name}) with {len(messages)} messages"
        )

        try:
            response = llm.invoke(messages)
        except Exception as e:
            logger.error(
                f"[{ctx.workflow_id}] Step {step_index} ({agent_name}) LLM error: {e}",
                exc_info=True
            )
            response = AIMessage(content=f"Error en paso {step_index} ({agent_name}): {str(e)}")

        updates: dict = {
            "messages": [response],
            "current_step": step_index + 1,
            "execution_path": list(state.get("execution_path", [])) + [agent_name],
        }

        # Guardar en variables si se configuró output_variable
        if output_variable:
            variables = dict(state.get("variables", {}))
            variables[output_variable] = response.content.strip()
            updates["variables"] = variables
            logger.info(
                f"[{ctx.workflow_id}] Step {step_index} stored response in "
                f"variables.{output_variable}: '{response.content.strip()[:100]}'"
            )

        return updates

    return node


# =============================================================================
# BUILDER PRINCIPAL
# =============================================================================

def create_sequential_agent(ctx: TenantContext) -> StateGraph:
    """
    Construye el grafo secuencial desde la configuración del workflow.

    Lee ctx.graph_config["steps"] y construye una cadena lineal de nodos,
    uno por cada paso, conectados en orden de START hasta END.

    Args:
        ctx: TenantContext con graph_config["steps"]

    Returns:
        StateGraph compilado y listo para ejecutar

    Ejemplo de invocación:
        graph = create_sequential_agent(ctx)
        result = graph.invoke({
            "messages": [HumanMessage("Necesito un análisis de este contrato: ...")],
            "variables": {},
            "current_step": 0,
            "execution_path": []
        })
        # El último mensaje en result["messages"] es la respuesta final
    """
    steps_config: List[Dict] = ctx.graph_config.get("steps", [])

    if not steps_config:
        raise ValueError(
            f"[{ctx.workflow_id}] Sequential graph_config requires 'steps' list"
        )

    logger.info(
        f"[{ctx.workflow_id}] Building sequential graph with {len(steps_config)} steps"
    )

    graph = StateGraph(SequentialAgentState)

    # =========================================================================
    # 1. Crear y registrar un nodo por cada paso
    # =========================================================================
    node_ids = []

    for i, step in enumerate(steps_config):
        agent_name = step.get("agent", "default")
        output_variable = step.get("output_variable")

        # Generar ID único para el nodo (ej: "step_0_extractor")
        node_id = f"step_{i}_{agent_name}"
        node_ids.append(node_id)

        graph.add_node(node_id, _make_step_node(i, agent_name, output_variable, ctx))
        logger.debug(
            f"[{ctx.workflow_id}] Added sequential node: '{node_id}' (agent: {agent_name})"
        )

    # =========================================================================
    # 2. Conectar los nodos en cadena lineal: START → paso_0 → paso_1 → ... → END
    # =========================================================================
    graph.add_edge(START, node_ids[0])

    for i in range(len(node_ids) - 1):
        graph.add_edge(node_ids[i], node_ids[i + 1])

    graph.add_edge(node_ids[-1], END)

    # =========================================================================
    # 3. Compilar
    # =========================================================================
    compiled = graph.compile()

    logger.info(
        f"[{ctx.workflow_id}] Sequential graph compiled successfully. "
        f"Steps: {[s.get('agent', 'default') for s in steps_config]}"
    )

    return compiled
