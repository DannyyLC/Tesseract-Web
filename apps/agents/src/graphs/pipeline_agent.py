"""
Pipeline Agent - Grafo dinámico construido desde configuración

PATRÓN PIPELINE:
- Los nodos y conexiones se definen en graph_config, no en código
- Soporta tres tipos de nodos:
    * agent:     Llama al LLM para razonar y generar una respuesta
    * tool:      Ejecuta una tool directamente, sin LLM
    * condition: Evalúa el estado y enruta a la rama correcta

DIFERENCIA VS REACT:
- ReAct: el LLM decide cuándo y qué tools usar (loop dinámico)
- Pipeline: el flujo es explícito, predecible y definido en config (como N8N)

CASOS DE USO:
- Clasificar la intención del usuario y enrutar a diferentes agentes
- Enriquecer contexto antes de llamar al LLM (buscar perfil, historial, etc)
- Post-procesamiento después del agente (registrar, notificar, etc)
- Pipelines multi-agente donde cada uno tiene una responsabilidad específica

CONFIGURACIÓN ESPERADA EN graph_config:
{
  "type": "pipeline",
  "nodes": [
    {
      "id": "classify",
      "type": "agent",
      "agent": "classifier",         # Clave en agents_config (default, classifier, etc)
      "output_variable": "intent"    # Opcional: guarda la respuesta en state.variables
    },
    {
      "id": "route",
      "type": "condition",
      "config": {
        "mode": "switch",            # Evalúa state.variables[source] contra las ramas
        "source": "variables.intent",
        "branches": {
          "ventas":   "node_sales",
          "soporte":  "node_support",
          "default":  "node_generic"
        }
      }
    },
    {
      "id": "enrich",
      "type": "tool",
      "config": {
        "tool_instance": "uuid-del-tenant-tool",  # UUID del TenantTool en DB
        "function": "get_contact",                # Función específica a ejecutar
        "params": {
          "phone": "{{variables.user_phone}}",    # Template desde state.variables
          "fixed_param": "valor_fijo"             # Param hardcodeado
        },
        "output_variable": "user_profile"         # Guarda resultado en state.variables
      }
    },
    { "id": "node_sales",   "type": "agent", "agent": "sales"   },
    { "id": "node_support", "type": "agent", "agent": "support" },
    { "id": "node_generic", "type": "agent", "agent": "default" }
  ],
  "edges": [
    { "from": "START",        "to": "classify"     },
    { "from": "classify",     "to": "route"        },  # "route" es condition → se convierte en conditional edge
    { "from": "node_sales",   "to": "END"          },
    { "from": "node_support", "to": "END"          },
    { "from": "node_generic", "to": "END"          }
  ]
}

CÓMO FLUYEN LOS DATOS ENTRE NODOS:
- state.variables es el "bus de datos" del pipeline
- Los nodos leen y escriben en state.variables via output_variable / params con templates
- Los messages acumulan el historial de mensajes de todos los agentes
- El estado existe solo durante la ejecución; el Gateway persiste lo necesario en DB
"""

import re
import copy
import logging
from typing import Annotated, Any, Dict, List, Literal

from langgraph.graph import StateGraph, END, START
from langgraph.graph.message import add_messages
from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from typing_extensions import TypedDict

from datetime import datetime
import pytz

from core.context import TenantContext
from tools.registry import load_tools, get_llm, load_specific_tool


logger = logging.getLogger(__name__)


# =============================================================================
# ESTADO DEL GRAFO
# =============================================================================

class PipelineAgentState(TypedDict):
    """
    Estado compartido entre todos los nodos del pipeline.

    Campos:
        messages:       Historial de mensajes acumulado (reducer: concatena)
        variables:      Bus de datos entre nodos. Cada nodo puede leer/escribir aquí.
                        Ejemplo: {"intent": "ventas", "user_profile": {...}}
        current_node:   ID del nodo que se está ejecutando (para logging/debug)
        execution_path: Secuencia de nodos ejecutados en esta corrida
        iteration_count: Contador de seguridad para prevenir loops infinitos
    """
    messages: Annotated[list, add_messages]
    variables: Dict[str, Any]
    current_node: str
    execution_path: List[str]
    iteration_count: int


# =============================================================================
# UTILIDADES: RESOLUCIÓN DE PATHS Y TEMPLATES
# =============================================================================

def _resolve_path(state: PipelineAgentState, path: str) -> Any:
    """
    Resuelve un path con notación de punto contra el estado del grafo.

    Ejemplos:
        _resolve_path(state, "variables.intent")    → state["variables"]["intent"]
        _resolve_path(state, "variables.user.name") → state["variables"]["user"]["name"]

    Args:
        state: Estado actual del grafo
        path:  Path con notación de punto (ej: "variables.intent")

    Returns:
        El valor en ese path, o None si no existe
    """
    parts = path.split(".")
    current: Any = state

    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        else:
            current = getattr(current, part, None)

        if current is None:
            return None

    return current


def _render_params(params: Dict[str, Any], state: PipelineAgentState) -> Dict[str, Any]:
    """
    Renderiza los parámetros de un nodo tool reemplazando templates con valores del estado.

    Soporta dos formas:
    1. Template completo:  "{{variables.fecha}}"       → devuelve el valor tal cual (cualquier tipo)
    2. Template inline:   "Hola {{variables.nombre}}"  → reemplaza dentro del string

    Ejemplo:
        params = {
            "phone": "{{variables.user_phone}}",
            "message": "Hola {{variables.name}}, tu cita es el {{variables.date}}",
            "fixed": "valor_fijo"
        }
        → {
            "phone": "+5212345678",          # Valor real del estado
            "message": "Hola Carlos, tu cita es el 2026-03-27",
            "fixed": "valor_fijo"
          }
    """

    template_pattern = re.compile(r"\{\{([^}]+)\}\}")

    def render_value(value: Any) -> Any:
        if not isinstance(value, str):
            if isinstance(value, dict):
                return {k: render_value(v) for k, v in value.items()}
            if isinstance(value, list):
                return [render_value(item) for item in value]
            return value

        matches = template_pattern.findall(value)

        if not matches:
            return value

        # Template completo (el string entero es un template) → devolver tipo original
        if len(matches) == 1 and value.strip() == f"{{{{{matches[0]}}}}}":
            resolved = _resolve_path(state, matches[0].strip())
            return resolved

        # Template inline → reemplazar dentro del string
        result = value
        for match in matches:
            resolved = _resolve_path(state, match.strip())
            result = result.replace(f"{{{{{match}}}}}", str(resolved) if resolved is not None else "")

        return result

    return {k: render_value(v) for k, v in params.items()}


def _evaluate_condition(op: str, field_value: Any, compare_value: Any) -> bool:
    """
    Evalúa una operación de comparación para condiciones tipo 'rules'.

    Operaciones soportadas:
        eq       → field_value == compare_value
        neq      → field_value != compare_value
        gt       → field_value >  compare_value
        gte      → field_value >= compare_value
        lt       → field_value <  compare_value
        lte      → field_value <= compare_value
        contains → compare_value in str(field_value)
        in       → field_value in compare_value (compare_value debe ser lista)
    """
    try:
        if op == "eq":       return field_value == compare_value
        if op == "neq":      return field_value != compare_value
        if op == "gt":       return field_value > compare_value
        if op == "gte":      return field_value >= compare_value
        if op == "lt":       return field_value < compare_value
        if op == "lte":      return field_value <= compare_value
        if op == "contains": return compare_value in str(field_value)
        if op == "in":       return field_value in compare_value
    except (TypeError, ValueError):
        return False

    logger.warning(f"Operador de condición desconocido: '{op}'")
    return False


# =============================================================================
# FÁBRICAS DE NODOS
# =============================================================================

def _make_agent_node(node_id: str, agent_name: str, output_variable: str | None, ctx: TenantContext):
    """
    Crea un nodo que llama al LLM y opcionalmente guarda su respuesta en variables.

    El LLM se inicializa una sola vez al construir el grafo (no en cada ejecución).
    No ejecuta tools — para eso usar nodos de tipo 'tool'.

    Args:
        node_id:         ID del nodo (para logging)
        agent_name:      Clave en agents_config ("default", "classifier", "sales", etc)
        output_variable: Si se especifica, guarda el content de la respuesta en variables[output_variable]
        ctx:             TenantContext con toda la configuración
    """
    # Inicializar LLM una sola vez (closure)
    llm = get_llm(ctx, agent_name)

    logger.info(f"[{ctx.workflow_id}] Pipeline node '{node_id}' (agent:{agent_name}) initialized")

    def node(state: PipelineAgentState) -> dict:
        messages = list(state["messages"])
        agent_config = ctx.get_agent_config(agent_name)
        base_system_prompt = agent_config.get("system_prompt", "")

        # Inyectar contexto de tiempo (igual que en ReAct)
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
            f"[{ctx.workflow_id}] Pipeline node '{node_id}' calling LLM ({agent_name}) "
            f"with {len(messages)} messages"
        )

        try:
            response = llm.invoke(messages)
        except Exception as e:
            logger.error(f"[{ctx.workflow_id}] Node '{node_id}' LLM error: {e}", exc_info=True)
            response = AIMessage(content=f"Error en nodo {node_id}: {str(e)}")

        updates: Dict[str, Any] = {
            "messages": [response],
            "current_node": node_id,
            "execution_path": list(state.get("execution_path", [])) + [node_id],
        }

        # Guardar la respuesta en variables si se configuró output_variable
        if output_variable:
            variables = dict(state.get("variables", {}))
            variables[output_variable] = response.content.strip()
            updates["variables"] = variables
            logger.info(
                f"[{ctx.workflow_id}] Node '{node_id}' stored response in "
                f"variables.{output_variable}: '{response.content.strip()[:100]}'"
            )

        return updates

    return node


def _make_tool_node(node_id: str, config: Dict[str, Any], ctx: TenantContext):
    """
    Crea un nodo que ejecuta una tool directamente, sin pasar por el LLM.

    Flujo:
    1. Busca el tool_instance en ctx.agent_tool_instances por UUID
    2. Carga la tool usando el registry existente
    3. Renderiza los parámetros (reemplaza templates {{variables.x}})
    4. Ejecuta la función específica
    5. Guarda el resultado en state.variables[output_variable]

    Args:
        node_id: ID del nodo (para logging)
        config:  {
                   "tool_instance": "uuid",      # UUID del TenantTool
                   "function": "func_name",      # Función específica a llamar
                   "params": {...},              # Parámetros (pueden tener templates)
                   "output_variable": "key"      # Dónde guardar el resultado
                 }
        ctx:     TenantContext con tool_instances y credenciales
    """
    tool_instance_uuid = config.get("tool_instance")
    function_name = config.get("function")
    raw_params = config.get("params", {})
    output_variable = config.get("output_variable")

    # Buscar el tool_instance entre todos los agentes (se hace al construir el grafo)
    tool_instance = None
    for agent_tools in ctx.agent_tool_instances.values():
        if tool_instance_uuid in agent_tools:
            tool_instance = agent_tools[tool_instance_uuid]
            break

    if not tool_instance:
        raise ValueError(
            f"[{ctx.workflow_id}] Pipeline node '{node_id}': "
            f"tool_instance '{tool_instance_uuid}' no encontrado en agent_tool_instances"
        )

    # Cargar la tool una sola vez (closure)
    tool_name = tool_instance["tool_name"]
    credentials = tool_instance.get("credentials", {})
    tool_config = tool_instance.get("config", {})

    loaded_tools = load_specific_tool(tool_name, credentials, tool_config, ctx)
    loaded_tools = [copy.deepcopy(t) for t in loaded_tools]

    # Buscar la función específica por nombre
    target_tool = next((t for t in loaded_tools if t.name == function_name), None)

    if not target_tool:
        available = [t.name for t in loaded_tools]
        raise ValueError(
            f"[{ctx.workflow_id}] Pipeline node '{node_id}': "
            f"función '{function_name}' no encontrada en '{tool_name}'. "
            f"Disponibles: {available}"
        )

    logger.info(
        f"[{ctx.workflow_id}] Pipeline node '{node_id}' "
        f"(tool:{tool_name}.{function_name}) initialized"
    )

    def node(state: PipelineAgentState) -> dict:
        # Renderizar parámetros con valores del estado
        rendered_params = _render_params(raw_params, state)

        logger.info(
            f"[{ctx.workflow_id}] Pipeline node '{node_id}' executing "
            f"{tool_name}.{function_name} with params: {rendered_params}"
        )

        try:
            result = target_tool.invoke(rendered_params)
            logger.info(f"[{ctx.workflow_id}] Node '{node_id}' tool result: {str(result)[:200]}")
        except Exception as e:
            logger.error(f"[{ctx.workflow_id}] Node '{node_id}' tool error: {e}", exc_info=True)
            result = {"error": str(e)}

        updates: Dict[str, Any] = {
            "current_node": node_id,
            "execution_path": list(state.get("execution_path", [])) + [node_id],
            # Agregar el resultado como mensaje de contexto para nodos agente posteriores
            "messages": [ToolMessage(content=str(result), tool_call_id=node_id)],
        }

        if output_variable:
            variables = dict(state.get("variables", {}))
            variables[output_variable] = result
            updates["variables"] = variables
            logger.info(
                f"[{ctx.workflow_id}] Node '{node_id}' stored tool result in "
                f"variables.{output_variable}"
            )

        return updates

    return node


def _make_condition_function(node_id: str, config: Dict[str, Any], ctx: TenantContext):
    """
    Crea la función de condición para un conditional edge de LangGraph.

    La función retorna el ID del nodo destino según el estado actual.
    LangGraph usa ese retorno para decidir a dónde ir.

    Modos soportados:

    1. switch — Evalúa un campo del estado contra un mapa de ramas:
       {
         "mode": "switch",
         "source": "variables.intent",   # Path en el estado
         "branches": {
           "ventas":  "node_sales",
           "soporte": "node_support",
           "default": "node_generic"     # Fallback obligatorio
         }
       }

    2. rules — Evalúa reglas en orden, usa la primera que hace match:
       {
         "mode": "rules",
         "rules": [
           { "when": { "field": "variables.score", "op": "gte", "value": 0.8 }, "goto": "node_vip"      },
           { "when": { "field": "variables.plan",  "op": "eq",  "value": "pro" }, "goto": "node_pro"    }
         ],
         "default": "node_standard"
       }
    """
    mode = config.get("mode", "switch")

    if mode == "switch":
        source = config["source"]
        branches = config["branches"]

        def switch_condition(state: PipelineAgentState) -> str:
            value = _resolve_path(state, source)
            value_str = str(value).strip() if value is not None else ""

            destination = branches.get(value_str) or branches.get("default")

            if not destination:
                logger.error(
                    f"[{ctx.workflow_id}] Condition node '{node_id}': "
                    f"no branch matched for value '{value_str}' and no 'default' defined"
                )
                return END

            logger.info(
                f"[{ctx.workflow_id}] Condition node '{node_id}': "
                f"'{source}' = '{value_str}' → '{destination}'"
            )
            return destination

        return switch_condition

    elif mode == "rules":
        rules = config.get("rules", [])
        default = config.get("default", END)

        def rules_condition(state: PipelineAgentState) -> str:
            for rule in rules:
                when = rule.get("when", {})
                field_value = _resolve_path(state, when.get("field", ""))
                op = when.get("op", "eq")
                compare_value = when.get("value")

                if _evaluate_condition(op, field_value, compare_value):
                    destination = rule["goto"]
                    logger.info(
                        f"[{ctx.workflow_id}] Condition node '{node_id}': "
                        f"rule matched ({when['field']} {op} {compare_value}) → '{destination}'"
                    )
                    return destination

            logger.info(
                f"[{ctx.workflow_id}] Condition node '{node_id}': "
                f"no rules matched → default '{default}'"
            )
            return default

        return rules_condition

    else:
        raise ValueError(
            f"[{ctx.workflow_id}] Condition node '{node_id}': "
            f"mode desconocido '{mode}'. Usar 'switch' o 'rules'."
        )


# =============================================================================
# BUILDER PRINCIPAL
# =============================================================================

def create_pipeline_agent(ctx: TenantContext) -> StateGraph:
    """
    Construye dinámicamente el grafo LangGraph desde la configuración del workflow.

    Lee ctx.graph_config["nodes"] y ctx.graph_config["edges"] y construye
    el grafo de forma que:
    - Nodos tipo 'agent' y 'tool' se agregan como nodos de LangGraph
    - Nodos tipo 'condition' se convierten en conditional edges (no son nodos de LangGraph)
    - Las edges definen las conexiones; si el destino es un nodo condition,
      se usa add_conditional_edges automáticamente

    Args:
        ctx: TenantContext con graph_config["nodes"] y graph_config["edges"]

    Returns:
        StateGraph compilado y listo para ejecutar

    Ejemplo de invocación:
        graph = create_pipeline_agent(ctx)
        result = graph.invoke({
            "messages": [HumanMessage("Quiero agendar una cita")],
            "variables": {},
            "current_node": "",
            "execution_path": [],
            "iteration_count": 0
        })
    """
    nodes_config: List[Dict] = ctx.graph_config.get("nodes", [])
    edges_config: List[Dict] = ctx.graph_config.get("edges", [])

    if not nodes_config:
        raise ValueError(
            f"[{ctx.workflow_id}] Pipeline graph_config requires 'nodes' list"
        )
    if not edges_config:
        raise ValueError(
            f"[{ctx.workflow_id}] Pipeline graph_config requires 'edges' list"
        )

    logger.info(
        f"[{ctx.workflow_id}] Building pipeline graph: "
        f"{len(nodes_config)} nodes, {len(edges_config)} edges"
    )

    # Mapa rápido para buscar nodos por ID
    nodes_map: Dict[str, Dict] = {node["id"]: node for node in nodes_config}

    graph = StateGraph(PipelineAgentState)

    # =========================================================================
    # 1. Agregar nodos al grafo (solo agent y tool; condition se maneja en edges)
    # =========================================================================
    for node in nodes_config:
        node_id = node["id"]
        node_type = node.get("type")

        if node_type == "agent":
            agent_name = node.get("agent", "default")
            output_variable = node.get("output_variable")
            graph.add_node(node_id, _make_agent_node(node_id, agent_name, output_variable, ctx))
            logger.debug(f"[{ctx.workflow_id}] Added agent node: '{node_id}' (agent: {agent_name})")

        elif node_type == "tool":
            tool_config = node.get("config", {})
            graph.add_node(node_id, _make_tool_node(node_id, tool_config, ctx))
            logger.debug(f"[{ctx.workflow_id}] Added tool node: '{node_id}'")

        elif node_type == "condition":
            # Los nodos condition NO se agregan al grafo de LangGraph.
            # Se convierten en conditional edges al procesar las aristas.
            logger.debug(
                f"[{ctx.workflow_id}] Condition node '{node_id}' will be converted to conditional edge"
            )

        else:
            raise ValueError(
                f"[{ctx.workflow_id}] Unknown node type '{node_type}' in node '{node_id}'. "
                f"Supported types: 'agent', 'tool', 'condition'"
            )

    # =========================================================================
    # 2. Procesar aristas
    # =========================================================================
    for edge in edges_config:
        from_id = edge["from"]
        to_id = edge["to"]

        # Resolver nodos especiales de LangGraph
        from_node = START if from_id == "START" else from_id

        # Arista hacia END
        if to_id == "END":
            graph.add_edge(from_node, END)
            logger.debug(f"[{ctx.workflow_id}] Edge: '{from_id}' → END")
            continue

        # Verificar si el destino es un nodo condition
        dest_config = nodes_map.get(to_id)
        if dest_config and dest_config.get("type") == "condition":
            # Convertir en conditional edge: el from_node bifurca según la condición
            condition_fn = _make_condition_function(to_id, dest_config["config"], ctx)
            graph.add_conditional_edges(from_node, condition_fn)
            logger.debug(
                f"[{ctx.workflow_id}] Conditional edge: '{from_id}' → condition '{to_id}'"
            )
        else:
            graph.add_edge(from_node, to_id)
            logger.debug(f"[{ctx.workflow_id}] Edge: '{from_id}' → '{to_id}'")

    # =========================================================================
    # 3. Compilar
    # =========================================================================
    compiled = graph.compile()

    logger.info(f"[{ctx.workflow_id}] Pipeline graph compiled successfully")

    return compiled
