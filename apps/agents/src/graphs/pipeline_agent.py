"""
Pipeline Agent - Grafo dinámico construido desde configuración

PATRÓN PIPELINE:
- Los nodos y conexiones se definen en graph_config, no en código
- Soporta tres tipos de nodos:
    * agent:         Llama al LLM. Con max_iterations>0 entra en modo agéntico:
                     loop LLM↔tools hasta respuesta de texto o límite de iteraciones.
    * tool:          Ejecuta una tool directamente, sin LLM
    * condition:     Evalúa el estado y enruta a la rama correcta
    * set_variables: Actualiza variables del estado sin llamar al LLM

DIFERENCIA VS REACT:
- ReAct:     el LLM decide cuándo y qué tools usar (loop dinámico, grafo implícito)
- Pipeline:  el flujo es explícito y definido en config (como N8N). Los nodos agent
             pueden ser agénticos (max_iterations>0) para function calling dentro del
             flujo explícito, sin convertir todo el grafo en un ReAct.

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
import operator
from typing import Annotated, Any, Dict, List, Literal

from langgraph.graph import StateGraph, END, START
from langgraph.graph.message import add_messages
from langgraph.types import Send
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

# Tag de LangChain que marca las llamadas LLM cuyos tokens NO deben streamearse
# al usuario (especialistas en modo paralelo, nodos silent). El servicer filtra
# por este tag.
NO_STREAM_TAG = "pipeline_no_stream"

# Versión máxima del contrato de graph_config que este motor soporta.
# La evolución del schema es SOLO ADITIVA (ver docs/graph-schema.md).
SUPPORTED_SCHEMA_VERSION = 1


def _merge_variables(left: Dict[str, Any] | None, right: Dict[str, Any] | None) -> Dict[str, Any]:
    """
    Reducer del canal `variables`: merge superficial de DELTAS.

    Cada nodo escribe solo las claves que cambió (no una copia completa del dict);
    con ramas paralelas, claves distintas se combinan y la misma clave escrita por
    dos ramas en el mismo superstep queda en last-writer-wins (orden de los Send).
    No apoyar lógica de negocio en ese orden.
    """
    return {**(left or {}), **(right or {})}


def _make_variables_reducer(reducers_cfg: Dict[str, Any] | None):
    """
    Construye el reducer del canal `variables` respetando los modos declarados en
    graph_config.variable_reducers: {"<var>": {"mode": "join"|"append"|"last", ...}}.

    Modos:
        last   (default) — la escritura nueva pisa la anterior (comportamiento clásico)
        join   — une valores en un string con "separator" (default ","), deduplicando
                 y descartando vacíos. Sobrevive a escrituras de ramas paralelas.
        append — acumula en lista (concatena listas, agrega escalares)

    Sin variable_reducers declarados, es equivalente a _merge_variables.
    """
    reducers_cfg = reducers_cfg or {}

    if not reducers_cfg:
        return _merge_variables

    def reduce_variables(left: Dict[str, Any] | None, right: Dict[str, Any] | None) -> Dict[str, Any]:
        left = left or {}
        right = right or {}
        out = dict(left)
        for key, value in right.items():
            cfg = reducers_cfg.get(key)
            mode = (cfg or {}).get("mode", "last")

            if mode == "join" and key in out and out[key] not in (None, "") and value not in (None, ""):
                separator = (cfg or {}).get("separator", ",")
                out[key] = _join_dedup([out[key], value], separator)
            elif mode == "append" and key in out and out[key] is not None and value is not None:
                prev = out[key] if isinstance(out[key], list) else [out[key]]
                new = value if isinstance(value, list) else [value]
                out[key] = prev + new
            else:
                out[key] = value
        return out

    return reduce_variables


def _keep_last(left: Any, right: Any) -> Any:
    """Reducer last-value tolerante a escrituras concurrentes (no lanza error)."""
    return right if right is not None else left


def _append_or_reset(left: list | None, right: list | None) -> list:
    """
    operator.add con reset: escribir None vacía el canal.
    Lo usa el synthesizer para limpiar pending_handoffs tras ejecutar el handoff real.
    """
    if right is None:
        return []
    return (left or []) + right


class PipelineAgentState(TypedDict):
    """
    Estado compartido entre todos los nodos del pipeline.

    Campos:
        messages:        Historial de mensajes acumulado (reducer: concatena)
        variables:       Bus de datos entre nodos. Los nodos escriben DELTAS (solo las
                         claves que cambian); el reducer las mergea. Ejemplo:
                         {"intent": ["ventas"], "user_profile": {...}}
        current_node:    ID del último nodo ejecutado (para logging/debug)
        execution_path:  Secuencia de nodos ejecutados en esta corrida (cada nodo
                         aporta [su_id]; el reducer concatena)
        iteration_count: Contador de seguridad para prevenir loops infinitos
        specialist_outputs: Respuestas de especialistas ejecutados en modo paralelo:
                         [{node_id, agent, intent, content, usage_metadata,
                           response_metadata}]. El synthesizer las combina en una
                         sola respuesta. No se persiste entre turnos.
        pending_handoffs: Capturas de tools interceptadas en modo paralelo:
                         [{agent, node_id, tool_name, base_name, args, handoff_label}].
                         `handoff_label` es la etiqueta fija del nodo (config, no LLM)
                         usada para componer el "motivo" determinista del handoff — ver
                         `_apply_handoff_reason`. El synthesizer ejecuta UNA llamada real
                         por grupo y resetea el canal (escribiendo None). No se persiste
                         entre turnos.
        collected_variables: Snapshots de los deltas de set_variables_on_tool_call de
                         cada rama paralela (reducer: concatena). A diferencia de
                         `variables` (merge last-writer-wins), aquí se preservan TODOS
                         los valores de cada rama para que el synthesizer pueda
                         fusionarlos (p.ej. concatenar media_url con `join_variables`).
                         No se persiste entre turnos.
        parallel_mode:   True solo dentro del input de un Send (rama paralela).
                         Ningún nodo lo escribe como update.
        current_intent:  Intent que originó esta rama paralela (viaja en el Send).
    """
    messages: Annotated[list, add_messages]
    variables: Annotated[Dict[str, Any], _merge_variables]
    current_node: Annotated[str, _keep_last]
    execution_path: Annotated[List[str], operator.add]
    iteration_count: int
    specialist_outputs: Annotated[list, operator.add]
    pending_handoffs: Annotated[list, _append_or_reset]
    collected_variables: Annotated[list, operator.add]
    internal_usage: Annotated[list, operator.add]
    parallel_mode: bool
    current_intent: str


def _build_state_class(variable_reducers: Dict[str, Any] | None):
    """
    Construye el schema de estado del pipeline POR WORKFLOW.

    Los reducers de LangGraph son estáticos en el TypedDict, así que para que
    graph_config.variable_reducers sea configurable, el builder crea la clase de
    estado dinámicamente con el reducer de `variables` como closure sobre la
    config. Sin variable_reducers declarados, devuelve el schema clásico.
    """
    if not variable_reducers:
        return PipelineAgentState

    return TypedDict("PipelineAgentState", {
        "messages": Annotated[list, add_messages],
        "variables": Annotated[Dict[str, Any], _make_variables_reducer(variable_reducers)],
        "current_node": Annotated[str, _keep_last],
        "execution_path": Annotated[List[str], operator.add],
        "iteration_count": int,
        "specialist_outputs": Annotated[list, operator.add],
        "pending_handoffs": Annotated[list, _append_or_reset],
        "collected_variables": Annotated[list, operator.add],
        "internal_usage": Annotated[list, operator.add],
        "parallel_mode": bool,
        "current_intent": str,
    })


# =============================================================================
# UTILIDADES: RESOLUCIÓN DE PATHS Y TEMPLATES
# =============================================================================

# Namespaces reconocidos por el motor de templates. Un template cuyo primer
# segmento NO esté aquí se deja LITERAL (no se reemplaza por vacío): permite que
# los system prompts contengan texto como "{{1}}" (placeholders de Meta) sin que
# el renderizado los destruya.
_TEMPLATE_ROOTS = {
    "variables",        # bus de datos del pipeline (state.variables)
    "context",          # TenantContext de solo lectura (user_metadata, channel, ...)
    "current_node",
    "current_intent",
    "execution_path",
}

# Campos del TenantContext expuestos al namespace {{context.*}} (solo lectura)
_CONTEXT_FIELDS = {
    "user_metadata", "channel", "timezone", "user_id",
    "conversation_id", "tenant_id", "workflow_id", "user_type",
}


def _resolve_path(state: PipelineAgentState, path: str, ctx: "TenantContext | None" = None) -> Any:
    """
    Resuelve un path con notación de punto contra el estado del grafo, o contra
    el TenantContext si el path empieza con "context.".

    Ejemplos:
        _resolve_path(state, "variables.intent")             → state["variables"]["intent"]
        _resolve_path(state, "variables.user.name")          → state["variables"]["user"]["name"]
        _resolve_path(state, "context.user_metadata.phone")  → ctx.user_metadata["phone"]

    Returns:
        El valor en ese path, o None si no existe
    """
    parts = path.split(".")

    if parts[0] == "context":
        if ctx is None or len(parts) < 2 or parts[1] not in _CONTEXT_FIELDS:
            return None
        current: Any = getattr(ctx, parts[1], None)
        parts = parts[2:]
    else:
        current = state

    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        else:
            current = getattr(current, part, None)

        if current is None:
            return None

    return current


_TEMPLATE_PATTERN = re.compile(r"\{\{([^}]+)\}\}")


def _is_known_template(path: str) -> bool:
    return path.split(".")[0].strip() in _TEMPLATE_ROOTS


def _render_template_value(
    value: Any, state: PipelineAgentState, ctx: "TenantContext | None" = None
) -> Any:
    """
    Resuelve templates {{variables.x}} / {{context.x}} contra el estado y el
    TenantContext. Es el ÚNICO motor de templates del pipeline: lo usan los
    params de nodos tool, set_variables, append_system_message,
    system_prompt_extra y el system_prompt de los agentes.

    Soporta dos formas:
    1. Template completo:  "{{variables.fecha}}"       → devuelve el valor tal cual (cualquier tipo)
    2. Template inline:   "Hola {{variables.nombre}}"  → reemplaza dentro del string

    Los templates con namespace desconocido (p.ej. "{{1}}" en un prompt) se dejan
    literales — nunca se reemplazan por vacío.
    """
    if not isinstance(value, str):
        if isinstance(value, dict):
            return {k: _render_template_value(v, state, ctx) for k, v in value.items()}
        if isinstance(value, list):
            return [_render_template_value(item, state, ctx) for item in value]
        return value

    matches = _TEMPLATE_PATTERN.findall(value)

    if not matches:
        return value

    # Template completo (el string entero es un template) → devolver tipo original
    if len(matches) == 1 and value.strip() == f"{{{{{matches[0]}}}}}":
        path = matches[0].strip()
        if not _is_known_template(path):
            return value
        return _resolve_path(state, path, ctx)

    # Template inline → reemplazar dentro del string (solo namespaces conocidos)
    result = value
    for match in matches:
        path = match.strip()
        if not _is_known_template(path):
            continue
        resolved = _resolve_path(state, path, ctx)
        result = result.replace(f"{{{{{match}}}}}", str(resolved) if resolved is not None else "")

    return result


def _render_params(
    params: Dict[str, Any], state: PipelineAgentState, ctx: "TenantContext | None" = None
) -> Dict[str, Any]:
    """
    Renderiza los parámetros de un nodo tool reemplazando templates con valores del estado.

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
    return {k: _render_template_value(v, state, ctx) for k, v in params.items()}


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


def _tool_base_name(tool: Any) -> str | None:
    """Nombre original de la tool antes del sufijo de display_name (registry.load_tools)."""
    return (getattr(tool, "metadata", None) or {}).get("base_name")


def _tool_name_matches(configured_name: str, tool: Any) -> bool:
    """
    Matchea el nombre de tool de una config contra una tool cargada.

    Las tools se renombran a '{base}_{display_suffix}' al cargarse; las configs
    pueden referenciarlas por el nombre base (recomendado) o por el nombre completo.
    """
    return configured_name == tool.name or configured_name == _tool_base_name(tool)


def _extract_intents(pattern: re.Pattern, content: str) -> tuple[List[str], str]:
    """
    Extrae TODOS los intents de una respuesta y limpia los tags del texto visible.

    Soporta ambos formatos de emisión:
        - Tags repetidos:       "[ROUTE:a] [ROUTE:b]"
        - Lista con comas:      "[ROUTE:a,b]"   (el regex debe permitir comas en el grupo)

    Returns:
        (intents normalizados y deduplicados preservando orden, content sin tags)
    """
    intents: List[str] = []
    for group in pattern.findall(content):
        for part in str(group).split(","):
            p = part.strip().lower()
            if p and p not in intents:
                intents.append(p)
    cleaned = pattern.sub("", content).strip()
    return intents, cleaned


def _normalize_intents(value: Any) -> List[str]:
    """
    Normaliza el valor de la variable de ruteo a lista de intents.

    Retrocompatible: acepta lista, string único ("ventas"), string con comas
    ("ventas,soporte") o None. Dedup preservando orden.
    """
    if value is None:
        return []
    if isinstance(value, str):
        raw_parts = value.split(",")
    elif isinstance(value, list):
        raw_parts = value
    else:
        raw_parts = [value]

    out: List[str] = []
    for part in raw_parts:
        p = str(part).strip().lower()
        if p and p not in out:
            out.append(p)
    return out


def _build_time_context(ctx: TenantContext) -> str:
    """Bloque de contexto de fecha/hora local que se suma al system prompt."""
    try:
        local_tz = pytz.timezone(ctx.timezone)
    except pytz.UnknownTimeZoneError:
        local_tz = pytz.UTC

    current_time = datetime.now(local_tz)
    return (
        f"\n---\n"
        f"SYSTEM DYNAMIC CONTEXT:\n"
        f"Today's Date: {current_time.strftime('%A, %B %d, %Y')}\n"
        f"Current Local Time: {current_time.strftime('%I:%M %p')} (Timezone: {ctx.timezone})\n"
        f"---\n"
    )


# =============================================================================
# FÁBRICAS DE NODOS
# =============================================================================

def _make_agent_node(node_id: str, agent_name: str, output_variable: str | None, ctx: TenantContext,
                     classification_pattern: str | None = None, max_iterations: int = 0,
                     disable_tools_if: List[Dict[str, Any]] | None = None,
                     set_variables_on_tool_call: Dict[str, Dict[str, Any]] | None = None,
                     intercept_tools_in_parallel: List[str] | None = None,
                     handoff_label: str | None = None,
                     handoff_reason_injection: Dict[str, Any] | None = None,
                     silent: bool = False,
                     system_prompt_extra: str = ""):
    """
    Crea un nodo que llama al LLM y opcionalmente guarda su respuesta en variables.

    El LLM se inicializa una sola vez al construir el grafo (no en cada ejecución).

    Modos de operación:
    - Single-call (default, max_iterations=0): una llamada al LLM, sin tools.
    - Agéntico (max_iterations>0): loop LLM ↔ tools hasta respuesta de texto o límite de iteraciones.
      Las tools se cargan desde agents_config[agent_name]["tools"] vía load_tools().

    Args:
        node_id:                ID del nodo (para logging)
        agent_name:             Clave en agents_config ("default", "classifier", "sales", etc)
        output_variable:        Si se especifica, guarda un valor en variables[output_variable].
                                Sin classification_pattern → guarda el content completo.
                                Con classification_pattern → guarda el grupo extraído del patrón.
        ctx:                    TenantContext con toda la configuración
        classification_pattern: Regex opcional. Si el LLM incluye el patrón en su respuesta, se extrae el
                                grupo 1, se guarda en variables[output_variable] y el tag se limpia del
                                mensaje visible. Si el mensaje queda vacío tras limpiar, no se agrega al
                                historial. Si variables.routing_locked es True, el patrón se ignora.
                                En modo agéntico, el patrón se evalúa solo sobre la respuesta final de texto.
        max_iterations:         Número máximo de rondas LLM↔tools (0 = single-call, sin tools).
        disable_tools_if:       Lista de reglas para deshabilitar tools según el estado, evaluadas al
                                inicio de cada ejecución del nodo. Cada regla:
                                  {"tool": "nombre" (opcional, None = todas),
                                   "field": "variables.x", "op": "eq", "value": ...}
                                Si la regla matchea, la tool NO se enlaza al LLM en esta ejecución
                                (el LLM no puede llamarla). Gating determinista, sin prompt.
        set_variables_on_tool_call:
                                Mapa {tool_name: {variable: valor}}. Cuando el LLM llama esa tool,
                                las variables se setean de forma determinista en el estado, en el
                                momento del intento (independiente de si la tool tuvo éxito).
                                El tool_name puede ser el nombre base (sin sufijo de display_name)
                                o el nombre completo.
        intercept_tools_in_parallel:
                                Lista de nombres de tool (base o completos) que en MODO PARALELO
                                (rama de un fan-out multi-intent) NO se ejecutan: la llamada se
                                captura en pending_handoffs y el synthesizer hace una única
                                invocación real consolidada. En modo single la tool se ejecuta
                                directo, como siempre.
        handoff_label:          Etiqueta fija de este nodo (p.ej. "Armas menos letales") usada,
                                junto con handoff_reason_injection, para componer el "motivo" del
                                handoff sin depender de que el LLM lo redacte. Viaja en cada
                                captura de pending_handoffs (clave "handoff_label") para que el
                                synthesizer pueda unir las etiquetas de todos los especialistas
                                que contribuyeron. Es requisito de activación (ver
                                handoff_reason_injection): sin handoff_label, este nodo NUNCA
                                sobrescribe variables.body, sin importar si handoff_reason_injection
                                está configurado a nivel grafo.
        silent:                 Si True, el nodo es INTERNO: toda llamada LLM lleva NO_STREAM_TAG
                                (sus tokens nunca llegan al usuario), su respuesta va SOLO a
                                variables[output_variable] y no escribe messages ni
                                specialist_outputs. El usage se reporta vía el canal
                                internal_usage para el accounting del servicer.
        system_prompt_extra:    Template opcional que se suma al system prompt del agente en cada
                                ejecución (p.ej. "{{variables.handoff_notice_text}}"). Un template
                                que resuelve a vacío no agrega nada. Sustituto explícito y visible
                                del canal interno __append_system_message__.
        handoff_reason_injection:
                                Config opcional (normalmente heredada del graph_config raíz vía
                                create_pipeline_agent): {"tool", "list_arg", "variables_key",
                                "label_separator"}. La inyección SOLO se activa si, además de que
                                la tool llamada matchee "tool" (vía _tool_name_matches), este nodo
                                declara handoff_label — así un mismo graph_config puede aplicar el
                                mecanismo a unos nodos (catálogo fijo) y dejar intacto el de otros
                                (p.ej. el handoff excepcional de agent_general, que no declara
                                handoff_label y por tanto el LLM sigue controlando variables.body
                                libremente, igual que antes de este mecanismo). Cuando se activa,
                                sobrescribe variables[<variables_key>] = [handoff_label, resumen]
                                ANTES de invocar la tool directo, con resumen =
                                _summarize_handoff_conversation(llm, state["messages"]).
    """
    llm = get_llm(ctx, agent_name)
    pattern = re.compile(classification_pattern) if classification_pattern else None

    # Modo agéntico: cargar tools una sola vez al construir el grafo
    agent_tools = load_tools(ctx, agent_name) if max_iterations > 0 else []
    llm_with_tools = llm.bind_tools(agent_tools) if agent_tools else llm
    tools_by_name = {t.name: t for t in agent_tools}
    is_agentic = bool(agent_tools)

    logger.info(
        f"[{ctx.workflow_id}] Pipeline node '{node_id}' (agent:{agent_name}) initialized"
        + (f" [agentic, {len(agent_tools)} tools, max_iterations={max_iterations}]" if is_agentic else "")
    )

    def node(state) -> dict:
        messages = list(state["messages"])
        agent_config = ctx.get_agent_config(agent_name)
        # El system prompt soporta templates {{variables.x}} / {{context.x}}
        # (los namespaces desconocidos, p.ej. "{{1}}", se dejan literales)
        base_system_prompt = _render_template_value(
            agent_config.get("system_prompt", ""), state, ctx
        )

        # Rama de un fan-out multi-intent (viaja en el input del Send, no en el estado global)
        parallel = bool(state.get("parallel_mode"))

        # Lecturas sobre el estado; escrituras SOLO al delta (los canales usan reducers
        # de merge — escribir una copia completa pisaría escrituras de ramas paralelas)
        state_vars = state.get("variables", {})
        variables_delta: Dict[str, Any] = {}
        # Snapshots de cada set_variables_on_tool_call aplicado (para que el synthesizer
        # pueda fusionar valores que el reducer de `variables` colapsaría en paralelo).
        collected_sv: List[Dict[str, Any]] = []

        time_context = _build_time_context(ctx)
        system_prompt = base_system_prompt + time_context if base_system_prompt else time_context

        # system_prompt_extra: texto adicional declarado en la config del nodo,
        # con templates. Si resuelve a vacío, no agrega nada.
        if system_prompt_extra:
            extra = _render_template_value(system_prompt_extra, state, ctx)
            if extra and str(extra).strip():
                system_prompt = (system_prompt + "\n\n" + str(extra)) if system_prompt else str(extra)

        # Canal interno (legacy): un nodo set_variables previo pudo dejar texto a sumar
        # al system prompt. Se consume aquí (delta a None; None se trata como ausente).
        append_system_msg = state_vars.get("__append_system_message__")
        if append_system_msg:
            system_prompt = (system_prompt + "\n\n" + append_system_msg) if system_prompt else append_system_msg
            variables_delta["__append_system_message__"] = None

        if system_prompt:
            if not messages or messages[0].type != "system":
                messages = [SystemMessage(content=system_prompt)] + messages
            else:
                messages[0] = SystemMessage(content=system_prompt)

        updates: Dict[str, Any] = {
            "current_node": node_id,
            "execution_path": [node_id],
        }

        def invoke_llm(llm_obj, msgs):
            # En paralelo (y en nodos silent) los tokens no deben llegar al stream
            # del usuario; el servicer filtra las llamadas con NO_STREAM_TAG.
            if parallel or silent:
                return llm_obj.invoke(msgs, config={"tags": [NO_STREAM_TAG]})
            return llm_obj.invoke(msgs)

        # ------------------------------------------------------------------
        # Llamada al LLM: single-call o loop agéntico
        # ------------------------------------------------------------------
        preceding_messages: List[Any] = []  # mensajes intermedios (tool calls + results)
        handoff_captures: List[Dict[str, Any]] = []  # tools interceptadas en modo paralelo
        _handoff_summary_cache: List[str] = []  # memoiza el resumen dentro de esta ejecución

        def _get_handoff_summary() -> str:
            if not _handoff_summary_cache:
                _handoff_summary_cache.append(
                    _summarize_handoff_conversation(llm, state["messages"])
                )
            return _handoff_summary_cache[0]

        final_response: AIMessage

        if is_agentic:
            current_messages = list(messages)
            content = ""

            # Gating determinista de tools: evaluar disable_tools_if contra el estado actual.
            # Las tools deshabilitadas NO se enlazan al LLM en esta ejecución — no puede llamarlas.
            if disable_tools_if:
                active_tools = []
                for t in agent_tools:
                    disabled = False
                    for rule in disable_tools_if:
                        rule_tool = rule.get("tool")
                        if rule_tool is not None and not _tool_name_matches(rule_tool, t):
                            continue
                        field_value = _resolve_path(state, rule.get("field", ""), ctx)
                        if _evaluate_condition(rule.get("op", "eq"), field_value, rule.get("value")):
                            disabled = True
                            break
                    if disabled:
                        logger.info(
                            f"[{ctx.workflow_id}] Node '{node_id}': tool '{t.name}' "
                            f"disabled by disable_tools_if rule"
                        )
                    else:
                        active_tools.append(t)
                runtime_llm = llm.bind_tools(active_tools) if active_tools else llm
            else:
                runtime_llm = llm_with_tools

            logger.info(
                f"[{ctx.workflow_id}] Pipeline node '{node_id}' starting agentic loop "
                f"({agent_name}, max_iterations={max_iterations})"
            )

            for _i in range(max_iterations):
                try:
                    response = invoke_llm(runtime_llm, current_messages)
                except Exception as e:
                    logger.error(f"[{ctx.workflow_id}] Node '{node_id}' LLM error: {e}", exc_info=True)
                    response = AIMessage(content=f"Error en nodo {node_id}: {str(e)}")

                if not getattr(response, "tool_calls", None):
                    # Respuesta final de texto — salir del loop
                    final_response = response
                    content = response.content
                    break

                # LLM quiere llamar tools: ejecutar y continuar
                logger.info(
                    f"[{ctx.workflow_id}] Node '{node_id}' iteration {_i + 1}: "
                    f"{len(response.tool_calls)} tool call(s): "
                    f"{[tc['name'] for tc in response.tool_calls]}"
                )
                preceding_messages.append(response)
                current_messages.append(response)

                for tc in response.tool_calls:
                    tool = tools_by_name.get(tc["name"])

                    # Setear variables de forma determinista al intentar llamar la tool
                    # (independiente del resultado — ver docstring de set_variables_on_tool_call).
                    # La config puede usar el nombre base o el nombre completo con sufijo.
                    if set_variables_on_tool_call:
                        sv_key = None
                        if tc["name"] in set_variables_on_tool_call:
                            sv_key = tc["name"]
                        elif tool is not None and _tool_base_name(tool) in set_variables_on_tool_call:
                            sv_key = _tool_base_name(tool)
                        if sv_key:
                            variables_delta.update(set_variables_on_tool_call[sv_key])
                            collected_sv.append(dict(set_variables_on_tool_call[sv_key]))
                            logger.info(
                                f"[{ctx.workflow_id}] Node '{node_id}': tool call '{tc['name']}' "
                                f"set variables {list(set_variables_on_tool_call[sv_key].keys())}"
                            )

                    # En modo paralelo las tools declaradas en intercept_tools_in_parallel
                    # NO se ejecutan: se captura la intención y el synthesizer hace una
                    # única llamada real consolidada.
                    intercepted = (
                        parallel
                        and intercept_tools_in_parallel
                        and tool is not None
                        and any(_tool_name_matches(n, tool) for n in intercept_tools_in_parallel)
                    )

                    if intercepted:
                        handoff_captures.append({
                            "agent": agent_name,
                            "node_id": node_id,
                            "tool_name": tc["name"],
                            "base_name": _tool_base_name(tool) or tc["name"],
                            "args": tc["args"],
                            "handoff_label": handoff_label,
                        })
                        tool_result = (
                            "Notificación registrada. Se enviará una sola notificación "
                            "consolidada al finalizar."
                        )
                        logger.info(
                            f"[{ctx.workflow_id}] Node '{node_id}': tool '{tc['name']}' "
                            f"intercepted in parallel mode (captured for synthesizer)"
                        )
                    else:
                        if (
                            handoff_reason_injection
                            and handoff_label
                            and tool is not None
                            and _tool_name_matches(handoff_reason_injection.get("tool", ""), tool)
                        ):
                            resumen = _get_handoff_summary()
                            _apply_handoff_reason(tc["args"], handoff_reason_injection, handoff_label, resumen)
                            logger.info(
                                f"[{ctx.workflow_id}] Node '{node_id}': handoff reason inyectado "
                                f"(motivo='{handoff_label}')"
                            )
                        try:
                            if tool:
                                tool_result = tool.invoke(tc["args"])
                                logger.info(
                                    f"[{ctx.workflow_id}] Node '{node_id}' tool '{tc['name']}' "
                                    f"result: {str(tool_result)[:200]}"
                                )
                            else:
                                tool_result = f"Tool '{tc['name']}' no disponible"
                                logger.warning(
                                    f"[{ctx.workflow_id}] Node '{node_id}': "
                                    f"tool '{tc['name']}' not found in agent tools"
                                )
                        except Exception as e:
                            logger.error(
                                f"[{ctx.workflow_id}] Node '{node_id}' tool '{tc['name']}' error: {e}",
                                exc_info=True,
                            )
                            tool_result = f"Error ejecutando '{tc['name']}': {str(e)}"

                    tm = ToolMessage(
                        content=str(tool_result),
                        tool_call_id=tc["id"],
                        name=tc["name"],
                    )
                    preceding_messages.append(tm)
                    current_messages.append(tm)

            else:
                # Se agotaron las iteraciones sin respuesta de texto — forzar respuesta final
                logger.warning(
                    f"[{ctx.workflow_id}] Node '{node_id}' reached max_iterations "
                    f"({max_iterations}), forcing final text response"
                )
                try:
                    final_response = invoke_llm(llm, current_messages)
                    content = final_response.content
                except Exception as e:
                    logger.error(
                        f"[{ctx.workflow_id}] Node '{node_id}' final LLM error: {e}", exc_info=True
                    )
                    final_response = AIMessage(content=f"Error en nodo {node_id}: {str(e)}")
                    content = final_response.content

        else:
            # Single-call (comportamiento original)
            logger.info(
                f"[{ctx.workflow_id}] Pipeline node '{node_id}' calling LLM ({agent_name}) "
                f"with {len(messages)} messages"
            )
            try:
                final_response = invoke_llm(llm, messages)
            except Exception as e:
                logger.error(f"[{ctx.workflow_id}] Node '{node_id}' LLM error: {e}", exc_info=True)
                final_response = AIMessage(content=f"Error en nodo {node_id}: {str(e)}")

            content = final_response.content

        # ------------------------------------------------------------------
        # Procesar respuesta final: classification_pattern y output_variable
        # ------------------------------------------------------------------
        if pattern and parallel:
            # Los especialistas de un fan-out no re-rutean: los intents ya fueron
            # decididos. Solo limpiar tags residuales del texto visible.
            content = pattern.sub("", content).strip()
        elif pattern:
            if not state_vars.get("routing_locked"):
                intents, cleaned = _extract_intents(pattern, content)
                if intents:
                    content = cleaned

                    previous_intents = _normalize_intents(
                        state_vars.get(output_variable) if output_variable else None
                    )
                    if output_variable:
                        # Siempre lista (el router acepta lista o string legacy)
                        variables_delta[output_variable] = intents

                    if set(intents) != set(previous_intents):
                        variables_delta["reroute_count"] = state_vars.get("reroute_count", 0) + 1

                    logger.info(
                        f"[{ctx.workflow_id}] Node '{node_id}' extracted intents {intents} "
                        f"(reroute_count={variables_delta.get('reroute_count', state_vars.get('reroute_count', 0))})"
                    )
        elif output_variable:
            variables_delta[output_variable] = content.strip()
            logger.info(
                f"[{ctx.workflow_id}] Node '{node_id}' stored response in "
                f"variables.{output_variable}: '{content.strip()[:100]}'"
            )

        # ------------------------------------------------------------------
        # Construir salida del nodo
        # ------------------------------------------------------------------
        if silent:
            # Nodo interno: la respuesta va SOLO a variables[output_variable];
            # nada al historial ni a specialist_outputs. El usage se reporta por
            # internal_usage para que el accounting del servicer no lo pierda.
            if output_variable:
                variables_delta[output_variable] = content.strip() if isinstance(content, str) else content
            usage = getattr(final_response, "usage_metadata", None)
            if usage:
                updates["internal_usage"] = [{
                    "usage_metadata": usage,
                    "response_metadata": getattr(final_response, "response_metadata", None),
                }]
            if variables_delta:
                updates["variables"] = variables_delta
            return updates

        if parallel:
            # Rama de fan-out: la respuesta NO va al historial (evita N burbujas al
            # usuario); va a specialist_outputs para que el synthesizer la combine.
            updates["specialist_outputs"] = [{
                "node_id": node_id,
                "agent": agent_name,
                "intent": state.get("current_intent"),
                "content": content,
                "usage_metadata": getattr(final_response, "usage_metadata", None),
                "response_metadata": getattr(final_response, "response_metadata", None),
            }]
            if handoff_captures:
                updates["pending_handoffs"] = handoff_captures
            if collected_sv:
                updates["collected_variables"] = collected_sv
        else:
            # preceding_messages contiene los AIMessage(tool_calls) + ToolMessages intermedios.
            # El mensaje final solo se agrega si tiene contenido visible tras limpiar el tag.
            if content:
                if content == final_response.content:
                    final_msg = final_response
                else:
                    # Mensaje limpio, preservando metadata de tokens para el accounting del servicer
                    final_msg = AIMessage(content=content)
                    if getattr(final_response, "usage_metadata", None):
                        final_msg.usage_metadata = final_response.usage_metadata
                    if getattr(final_response, "response_metadata", None):
                        final_msg.response_metadata = final_response.response_metadata

                updates["messages"] = preceding_messages + [final_msg]
            elif preceding_messages:
                # Solo hubo tool calls (sin texto final visible)
                updates["messages"] = preceding_messages

        if variables_delta:
            updates["variables"] = variables_delta

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

    def node(state) -> dict:
        # Renderizar parámetros con valores del estado y del contexto
        rendered_params = _render_params(raw_params, state, ctx)

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
            "execution_path": [node_id],
            # Agregar el resultado como mensaje de contexto para nodos agente posteriores
            "messages": [ToolMessage(content=str(result), tool_call_id=node_id)],
        }

        if output_variable:
            # Delta: solo la clave que cambió (los reducers mergean)
            updates["variables"] = {output_variable: result}
            logger.info(
                f"[{ctx.workflow_id}] Node '{node_id}' stored tool result in "
                f"variables.{output_variable}"
            )

        return updates

    return node


def _make_set_variables_node(node_id: str, config: Dict[str, Any], ctx: TenantContext):
    """
    Nodo sin LLM que:
    1. Setea variables en el estado.
    2. Opcionalmente deja texto para sumar al system prompt del siguiente nodo agent
       (vía el canal interno variables.__append_system_message__, que el agent consume y limpia).

    Config:
        variables:             dict con las variables a setear. Los valores soportan
                                templates {{variables.x}} (ver _render_template_value),
                                resueltos contra el estado en el momento de ejecución.
        append_system_message: texto a agregar al system prompt del siguiente nodo agent.
                                También soporta templates {{variables.x}}.
    """
    variables_to_set = config.get("variables", {})
    append_msg_template = config.get("append_system_message", "")

    logger.info(f"[{ctx.workflow_id}] set_variables node '{node_id}' initialized")

    def node(state) -> dict:
        # Delta: solo las claves seteadas (los reducers mergean), templates resueltos
        variables_delta = _render_params(variables_to_set, state, ctx)

        append_msg = (
            _render_template_value(append_msg_template, state, ctx) if append_msg_template else ""
        )
        if append_msg:
            variables_delta["__append_system_message__"] = append_msg

        logger.info(
            f"[{ctx.workflow_id}] set_variables '{node_id}': "
            f"vars={list(variables_to_set.keys())}, append_msg={bool(append_msg)}"
        )

        return {
            "variables": variables_delta,
            "current_node": node_id,
            "execution_path": [node_id],
        }

    return node


def _merge_tool_args(args_list: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Combina los args de múltiples capturas de una misma tool en una sola llamada.

    Por clave: si el valor acumulado y el nuevo son listas → se concatenan
    (p.ej. 'messages' de send_bulk_whatsapp); en cualquier otro caso → last-wins.
    """
    merged: Dict[str, Any] = {}
    for args in args_list:
        for key, value in (args or {}).items():
            if key in merged and isinstance(merged[key], list) and isinstance(value, list):
                merged[key] = merged[key] + value
            else:
                merged[key] = value
    return merged


def _join_dedup(values: List[Any], separator: str) -> str:
    """Une valores en un string, ignorando vacíos y eliminando duplicados por orden."""
    out: List[str] = []
    for v in values:
        s = str(v).strip()
        if s and s not in out:
            out.append(s)
    return separator.join(out)


def _consolidate_list_items(
    items: List[Dict[str, Any]], group_by: str, merge_field: str, separator: str
) -> List[Dict[str, Any]]:
    """
    Colapsa items que comparten `group_by` en uno solo, fusionando `merge_field`.

    Pensado para el argumento `messages` de send_bulk_whatsapp: agrupa por
    destinatario (`to`) y fusiona el dict de variables de plantilla posición por
    posición (cada canal — body/header/buttons — es una lista ordenada de
    placeholders; los valores en la misma posición se unen con `separator`,
    deduplicando). Los items que no son dicts o no traen `group_by` se dejan
    intactos. Preserva el orden de aparición de los grupos.

    Ejemplo (group_by="to", merge_field="variables", separator=", "):
        [{"to": "X", "template_id": "t", "variables": {"body": ["blindaje", "detalle A"]}},
         {"to": "X", "template_id": "t", "variables": {"body": ["armas", "detalle B"]}}]
      → [{"to": "X", "template_id": "t",
          "variables": {"body": ["blindaje, armas", "detalle A, detalle B"]}}]
    """
    grouped: Dict[Any, List[Dict[str, Any]]] = {}
    order: List[Any] = []
    passthrough: List[Dict[str, Any]] = []

    for item in items:
        if not isinstance(item, dict) or group_by not in item:
            passthrough.append(item)
            continue
        key = item[group_by]
        if key not in grouped:
            grouped[key] = []
            order.append(key)
        grouped[key].append(item)

    consolidated: List[Dict[str, Any]] = []
    for key in order:
        members = grouped[key]
        base = dict(members[0])  # conserva to, template_id y demás campos escalares
        merged_channels: Dict[str, List[str]] = {}
        for member in members:
            variables = member.get(merge_field) or {}
            if not isinstance(variables, dict):
                continue
            for channel, placeholders in variables.items():
                values = placeholders if isinstance(placeholders, list) else [placeholders]
                bucket = merged_channels.setdefault(channel, [])
                for idx, val in enumerate(values):
                    if idx < len(bucket):
                        bucket[idx].append(val)
                    else:
                        bucket.append([val])
        if merged_channels:
            base[merge_field] = {
                channel: [_join_dedup(pos, separator) for pos in positions]
                for channel, positions in merged_channels.items()
            }
        consolidated.append(base)

    return consolidated + passthrough


def _summarize_handoff_conversation(llm: Any, messages: List[Any]) -> str:
    """
    Genera un resumen conciso de la conversación para notificar un handoff.

    UNA sola llamada LLM, con visibilidad de TODA la conversación — pensada para
    usarse tanto desde el modo single (_make_agent_node, un especialista llama la
    tool directo) como desde el modo paralelo (_make_synthesizer_node, tras el
    fan-out), de forma que la calidad del resumen no dependa de cuántos
    especialistas participaron. Nunca debe llegar al stream del usuario: siempre
    se taguea con NO_STREAM_TAG, sin condicionar a modo paralelo o single.
    """
    instruction = (
        "Resume en máximo 2-3 frases, en español, la conversación con el cliente "
        "para notificar al equipo de ventas interno. Sé específico: si el cliente "
        "mencionó un producto, modelo, cantidad o urgencia concretos, inclúyelos "
        "tal cual. No inventes información que no esté en la conversación. "
        "Marca el nivel de prioridad como lo PRIMERO que dice el resumen, según "
        "estas dos categorías (evalúa en este orden, usa como mucho una): "
        "1) 'Prioridad: Gobierno' si el cliente indica que pertenece a una "
        "institución u organismo de gobierno (federal, estatal, municipal, "
        "fuerzas armadas, fiscalías, etc.). "
        "2) 'Prioridad: Alto' si no es de gobierno pero el cliente menciona un "
        "proyecto, cotización o licitación activa, o solicita algo relacionado "
        "con transporte de valores. "
        "Si no aplica ninguna de las dos, no incluyas ninguna etiqueta de "
        "prioridad y empieza el resumen directo con el contenido. "
        "Responde solo con el resumen, sin prefijos adicionales, comillas ni "
        "saltos de línea."
    )
    convo = [m for m in messages if getattr(m, "type", None) != "system"]
    try:
        response = llm.invoke(
            [SystemMessage(content=instruction)] + convo,
            config={"tags": [NO_STREAM_TAG]},
        )
        return (response.content or "").strip() or "Resumen no disponible"
    except Exception as e:
        logger.error(f"Error generando resumen de handoff: {e}", exc_info=True)
        return "Resumen no disponible"


def _apply_handoff_reason(
    args: Dict[str, Any], injection_cfg: Dict[str, Any], motivo: str, resumen: str
) -> None:
    """
    Sobrescribe in-place args[list_arg][i]["variables"][variables_key] = [motivo,
    resumen] en cada item de la lista, sin importar lo que el LLM haya puesto ahí.

    injection_cfg (config.handoff_reason_injection):
        list_arg:      arg de la tool que es una lista de items (default "messages")
        variables_key: sub-clave dentro de item["variables"] a sobrescribir (default "body")

    No falla si faltan claves — las crea. Reutilizada tal cual en modo single
    (sobre tc["args"]) y en modo paralelo (sobre merged_args, ya consolidado).
    """
    list_arg = injection_cfg.get("list_arg", "messages")
    variables_key = injection_cfg.get("variables_key", "body")
    items = args.get(list_arg)
    if not isinstance(items, list):
        return
    for item in items:
        if isinstance(item, dict):
            item.setdefault("variables", {})[variables_key] = [motivo, resumen]


def _make_synthesizer_node(node_id: str, agent_name: str, config: Dict[str, Any], ctx: TenantContext):
    """
    Nodo de convergencia del fan-out multi-intent.

    1. Si hay pending_handoffs (tools interceptadas por especialistas en paralelo),
       ejecuta UNA llamada real por grupo (agent, tool_name) con los args combinados,
       de forma DETERMINISTA en código (no depende de que el LLM "decida" notificar),
       y resetea el canal.
    2. Combina los specialist_outputs en UNA respuesta final al usuario:
       - 1 output  → pass-through sin LLM (el texto del especialista tal cual).
       - 2+ outputs → una llamada al LLM del agente synthesizer con las respuestas
         etiquetadas por especialista en el system prompt.

    Config del nodo:
        execute_pending_handoffs: ejecutar las tools capturadas (default True)
        handoff_notice:           texto a sumar al system prompt cuando se ejecutó
                                  un handoff (p.ej. "ya se notificó, no lo repitas")
        set_variables:            dict de variables a setear al terminar la síntesis
                                  (p.ej. {"intent": []} para resetear el ruteo: el
                                  siguiente turno cae al fallback y re-clasifica en
                                  vez de re-disparar el fan-out completo). Los valores
                                  soportan templates {{variables.x}} (p.ej.
                                  {"previous_intent": "{{variables.intent}}"} para
                                  copiar el intent vigente antes de resetearlo). Solo
                                  aplica cuando la síntesis corrió (hubo outputs).
        consolidate_handoffs:     opcional. Colapsa los items de la llamada de
                                  handoff que comparten un destinatario, para que
                                  varios especialistas que notifican al MISMO número
                                  generen UN solo mensaje (en vez de uno por captura).
                                  Forma: {"list_arg": "messages", "group_by": "to",
                                  "merge_field": "variables", "separator": ", "}.
                                  Sin este campo, las capturas se concatenan (N mensajes).
        join_variables:           opcional. Fusiona variables que las ramas paralelas
                                  setearon vía set_variables_on_tool_call y que el
                                  reducer de `variables` habría colapsado (last-writer
                                  -wins). Une los valores de cada rama en un solo string
                                  (deduplicando, ignorando vacíos) y lo escribe en
                                  variables[<clave>]. Forma: {"media_url": ","}.
        handoff_reason_injection: opcional (normalmente heredado del graph_config raíz vía
                                  create_pipeline_agent, no declarado aquí directamente).
                                  Se activa SOLO si la tool de un grupo de pending_handoffs
                                  matchea "tool" Y al menos una captura del grupo trae
                                  handoff_label — si ninguna lo declara (p.ej. un grupo
                                  formado solo por el handoff excepcional de agent_general),
                                  la tool call pasa intacta. Cuando se activa, sobrescribe
                                  variables[<variables_key>] = [motivo, resumen] en
                                  merged_args ANTES de invocar la tool real: motivo = join
                                  determinista de los handoff_label de todos los
                                  especialistas que contribuyeron a ese grupo (ver
                                  _join_dedup), resumen = una sola llamada a
                                  _summarize_handoff_conversation con toda la conversación.
                                  Así se evita que cada especialista redacte su propia
                                  versión del motivo/resumen y queden duplicados.

    El agente (agent_name) debe existir en agents_config como cualquier otro:
    define model, temperature y system_prompt del sintetizador.
    """
    llm = get_llm(ctx, agent_name)
    execute_pending_handoffs = config.get("execute_pending_handoffs", True)
    handoff_notice = config.get("handoff_notice", "")
    # Template opcional a sumar al system prompt de la síntesis (p.ej.
    # "{{variables.handoff_notice_text}}"). Vacío al resolver → no agrega nada.
    system_prompt_extra = config.get("system_prompt_extra", "")
    set_variables_on_finish = config.get("set_variables", {})
    consolidate_handoffs = config.get("consolidate_handoffs")
    # Variables a fusionar desde collected_variables (deltas de las ramas paralelas):
    # {"<var>": "<separador>"}. Une los valores de esa clave aportados por cada
    # especialista en un solo string (deduplicando, ignorando vacíos) y lo escribe
    # en variables[<var>], evitando el last-writer-wins del reducer de `variables`.
    join_variables = config.get("join_variables") or {}
    # Motivo/resumen deterministas del handoff (ver _apply_handoff_reason). Normalmente
    # heredado del graph_config raíz vía create_pipeline_agent — ver docstring de
    # _make_agent_node para el shape de {"tool", "list_arg", "variables_key", "label_separator"}.
    handoff_reason_injection = config.get("handoff_reason_injection")

    # Cache de tools cargadas por agente especialista (para ejecutar las capturas)
    tools_cache: Dict[str, list] = {}

    logger.info(
        f"[{ctx.workflow_id}] Synthesizer node '{node_id}' (agent:{agent_name}) initialized"
    )

    def node(state) -> dict:
        outputs = state.get("specialist_outputs", [])

        updates: Dict[str, Any] = {
            "current_node": node_id,
            "execution_path": [node_id],
        }

        if not outputs:
            logger.warning(
                f"[{ctx.workflow_id}] Synthesizer '{node_id}': sin specialist_outputs — no-op"
            )
            return updates

        # ------------------------------------------------------------------
        # 1. Handoff determinista: una llamada real por grupo (agent, tool)
        # ------------------------------------------------------------------
        handoffs_executed = False
        pending = state.get("pending_handoffs", [])

        if execute_pending_handoffs and pending:
            # Agrupar por tool (nombre base): aunque N especialistas hayan capturado
            # la misma tool, el usuario debe generar UNA sola notificación.
            groups: Dict[str, List[Dict[str, Any]]] = {}
            for capture in pending:
                key = capture.get("base_name") or capture.get("tool_name")
                groups.setdefault(key, []).append(capture)

            for base_name, captures in groups.items():
                try:
                    # La tool se carga con las credenciales del primer agente que la
                    # capturó (en la práctica todos referencian el mismo TenantTool).
                    capture_agent = captures[0].get("agent")
                    tool_name = captures[0].get("tool_name")
                    if capture_agent not in tools_cache:
                        tools_cache[capture_agent] = load_tools(ctx, capture_agent)
                    tool = next(
                        (t for t in tools_cache[capture_agent] if t.name == tool_name),
                        None,
                    )
                    if tool is None:
                        logger.error(
                            f"[{ctx.workflow_id}] Synthesizer '{node_id}': tool "
                            f"'{tool_name}' del agente '{capture_agent}' no encontrada"
                        )
                        continue

                    merged_args = _merge_tool_args([c.get("args", {}) for c in captures])

                    # Colapsar items que van al mismo destinatario en un solo
                    # mensaje (opcional, ver config.consolidate_handoffs).
                    if consolidate_handoffs:
                        list_arg = consolidate_handoffs.get("list_arg", "messages")
                        items = merged_args.get(list_arg)
                        if isinstance(items, list) and items:
                            merged_args[list_arg] = _consolidate_list_items(
                                items,
                                group_by=consolidate_handoffs.get("group_by", "to"),
                                merge_field=consolidate_handoffs.get("merge_field", "variables"),
                                separator=consolidate_handoffs.get("separator", ", "),
                            )

                    # Motivo/resumen deterministas: se calculan UNA sola vez por grupo
                    # (no por especialista) y sobrescriben lo que el LLM haya puesto,
                    # evitando la duplicidad de que cada rama redacte su propia versión.
                    # Gate: solo se activa si AL MENOS una captura del grupo trae
                    # handoff_label — si ninguna lo declara (p.ej. el handoff excepcional
                    # de un agente sin catálogo fijo, tipo agent_general), la tool call
                    # pasa intacta y el LLM sigue controlando variables.body como hoy.
                    labels = [c.get("handoff_label") for c in captures if c.get("handoff_label")]
                    if handoff_reason_injection and labels and _tool_name_matches(
                        handoff_reason_injection.get("tool", ""), tool
                    ):
                        motivo = _join_dedup(
                            labels, handoff_reason_injection.get("label_separator", ", ")
                        )
                        resumen = _summarize_handoff_conversation(llm, state["messages"])
                        _apply_handoff_reason(merged_args, handoff_reason_injection, motivo, resumen)
                        logger.info(
                            f"[{ctx.workflow_id}] Synthesizer '{node_id}': handoff reason inyectado "
                            f"(motivo='{motivo}', {len(labels)} especialista(s))"
                        )

                    result = tool.invoke(merged_args)
                    handoffs_executed = True
                    logger.info(
                        f"[{ctx.workflow_id}] Synthesizer '{node_id}': handoff consolidado "
                        f"'{base_name}' ({len(captures)} captura(s)) → {str(result)[:200]}"
                    )
                except Exception as e:
                    logger.error(
                        f"[{ctx.workflow_id}] Synthesizer '{node_id}': error ejecutando "
                        f"handoff '{base_name}': {e}",
                        exc_info=True,
                    )

            # Reset del canal: un ciclo posterior no debe re-enviar
            updates["pending_handoffs"] = None

        # ------------------------------------------------------------------
        # 2. Síntesis de las respuestas
        # ------------------------------------------------------------------
        if len(outputs) == 1:
            # Pass-through sin LLM. Sin usage_metadata: el accounting del servicer
            # ya suma los specialist_outputs (evita doble conteo).
            final_msg = AIMessage(content=outputs[0].get("content", ""))
            logger.info(
                f"[{ctx.workflow_id}] Synthesizer '{node_id}': 1 output → pass-through"
            )
        else:
            agent_config = ctx.get_agent_config(agent_name)
            base_system_prompt = _render_template_value(
                agent_config.get("system_prompt", ""), state, ctx
            )

            outputs_block = "\n\nRESPUESTAS DE LOS ESPECIALISTAS:\n" + "\n\n".join(
                f"[{o.get('intent') or o.get('agent')}]\n{o.get('content', '')}"
                for o in outputs
            )

            system_prompt = (base_system_prompt or "") + _build_time_context(ctx)
            if handoffs_executed and handoff_notice:
                system_prompt += "\n\n" + handoff_notice
            if system_prompt_extra:
                extra = _render_template_value(system_prompt_extra, state, ctx)
                if extra and str(extra).strip():
                    system_prompt += "\n\n" + str(extra)
            system_prompt += outputs_block

            messages = list(state["messages"])
            if not messages or messages[0].type != "system":
                messages = [SystemMessage(content=system_prompt)] + messages
            else:
                messages[0] = SystemMessage(content=system_prompt)

            logger.info(
                f"[{ctx.workflow_id}] Synthesizer '{node_id}': combinando "
                f"{len(outputs)} outputs"
            )
            try:
                final_msg = llm.invoke(messages)
            except Exception as e:
                logger.error(
                    f"[{ctx.workflow_id}] Synthesizer '{node_id}' LLM error: {e}",
                    exc_info=True,
                )
                # Fallback: concatenar las respuestas para no dejar al usuario sin nada
                final_msg = AIMessage(
                    content="\n\n".join(o.get("content", "") for o in outputs if o.get("content"))
                )

        updates["messages"] = [final_msg]

        # Templates {{variables.x}} resueltos contra el estado (p.ej. "previous_intent":
        # "{{variables.intent}}" copia el intent vigente antes de resetearlo).
        variables_delta: Dict[str, Any] = _render_params(set_variables_on_finish, state, ctx)

        # Fusionar variables acumuladas por las ramas paralelas (p.ej. media_url):
        # une todos los valores aportados en un solo string separado por el separador
        # configurado, evitando el last-writer-wins del reducer de `variables`.
        if join_variables:
            collected = state.get("collected_variables", [])
            for var_name, separator in join_variables.items():
                values = [
                    delta[var_name]
                    for delta in collected
                    if isinstance(delta, dict) and delta.get(var_name) is not None
                ]
                if values:
                    joined = _join_dedup(values, separator)
                    variables_delta[var_name] = joined
                    logger.info(
                        f"[{ctx.workflow_id}] Synthesizer '{node_id}': join_variables "
                        f"'{var_name}' ({len(values)} valor(es)) → '{joined[:200]}'"
                    )

        if variables_delta:
            # Delta: solo las claves configuradas (los reducers mergean)
            updates["variables"] = variables_delta
            logger.info(
                f"[{ctx.workflow_id}] Synthesizer '{node_id}': set variables "
                f"{list(variables_delta.keys())} al finalizar"
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

        def switch_condition(state) -> str:
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

        def rules_condition(state) -> str:
            for rule in rules:
                when = rule.get("when", {})
                field_value = _resolve_path(state, when.get("field", ""), ctx)
                op = when.get("op", "eq")
                compare_value = _render_template_value(when.get("value"), state, ctx)

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

    elif mode == "router":
        # Router conversacional con anti-loop y soporte multi-intent.
        # Rutea según un intent persistido (string legacy o lista de intents) y usa
        # execution_path para saber qué agentes ya respondieron en este ciclo.
        #
        # - 1 intent nuevo y sin outputs previos → retorna el nombre del nodo (string):
        #   modo single, ruta idéntica al comportamiento original.
        # - 2+ intents (o 1 nuevo habiendo outputs previos que reutilizar) → retorna
        #   list[Send]: fan-out paralelo con parallel_mode=True; los especialistas
        #   escriben a specialist_outputs y convergen en el synthesizer.
        #
        # Config adicional (opcional, retrocompatible):
        #   max_parallel_agents: tope de ramas paralelas por mensaje (default 3)
        #   synthesizer_node:    ID del nodo synthesizer (ruta defensiva cuando hay
        #                        outputs acumulados sin sintetizar)
        route_variable = config["route_variable"]   # e.g. "variables.intent"
        routes = config["routes"]                    # {"ventas": "agent_ventas", ...}
        fallback = config.get("fallback", END)
        max_reroutes = config.get("max_reroutes", 3)
        lock_node = config.get("lock_node")          # ID del nodo set_variables de lock (opcional)
        max_parallel_agents = config.get("max_parallel_agents", 3)
        synthesizer_node = config.get("synthesizer_node")
        # end_node: nodo al que ir en vez de END al terminar el turno (opcional).
        # Punto único de finalización — permite colgar cadenas post-turno (p.ej.
        # verificación de handoff) tanto en modo single como tras el lock.
        end_node = config.get("end_node")

        def router_condition(state):
            variables = state.get("variables", {})
            execution_path = state.get("execution_path", [])
            reroute_count = variables.get("reroute_count", 0)
            outputs_count = len(state.get("specialist_outputs", []))

            def finish():
                """Salida de fin de turno: end_node configurado (una sola vez) o END."""
                if end_node and end_node not in execution_path:
                    logger.info(
                        f"[{ctx.workflow_id}] Router '{node_id}': fin de turno → "
                        f"end_node '{end_node}'"
                    )
                    return end_node
                return END

            # Convergencia del fan-out: si hay specialist_outputs, un fan-out ya corrió
            # en este turno y la ÚNICA salida válida es el synthesizer (o END). No se
            # re-evalúa pending aquí: la evaluación de edges de una rama Send no ve las
            # escrituras de las ramas hermanas, y decidir con pending re-dispararía a
            # los otros especialistas en un segundo round duplicado.
            if outputs_count:
                if synthesizer_node and synthesizer_node not in execution_path:
                    logger.info(
                        f"[{ctx.workflow_id}] Router '{node_id}': fan-out completado "
                        f"({outputs_count} output(s) visibles) → '{synthesizer_node}'"
                    )
                    return synthesizer_node
                return finish()

            intents = _normalize_intents(_resolve_path(state, route_variable))
            valid_intents = [i for i in intents if i in routes]

            # Targets únicos preservando orden, con el intent que originó cada uno
            intent_by_target: Dict[str, str] = {}
            for intent in valid_intents:
                target = routes[intent]
                if target not in intent_by_target:
                    intent_by_target[target] = intent

            pending = [t for t in intent_by_target if t not in execution_path][:max_parallel_agents]

            # Anti-loop: máximo de re-ruteos alcanzado
            if reroute_count >= max_reroutes and lock_node:
                if lock_node not in execution_path:
                    logger.warning(
                        f"[{ctx.workflow_id}] Router '{node_id}': max_reroutes ({max_reroutes}) "
                        f"alcanzado → '{lock_node}'"
                    )
                    return lock_node
                logger.info(f"[{ctx.workflow_id}] Router '{node_id}': lock ya en path → fin de turno")
                return finish()

            # Sin intents válidos → fallback (p.ej. classifier)
            if not valid_intents:
                if fallback in execution_path:
                    logger.info(
                        f"[{ctx.workflow_id}] Router '{node_id}': fallback '{fallback}' ya en path → fin de turno"
                    )
                    return finish()
                logger.info(
                    f"[{ctx.workflow_id}] Router '{node_id}': intents={intents} → fallback '{fallback}'"
                )
                return fallback

            if not pending:
                logger.info(
                    f"[{ctx.workflow_id}] Router '{node_id}': targets ya en path → fin de turno"
                )
                return finish()

            if len(pending) == 1 and outputs_count == 0:
                # Modo single: ruta idéntica al comportamiento original (el especialista
                # escribe a messages, streaming intacto, tools reales directas).
                target_node = pending[0]
                logger.info(
                    f"[{ctx.workflow_id}] Router '{node_id}': "
                    f"intent='{intent_by_target[target_node]}' → '{target_node}' (single)"
                )
                return target_node

            # Modo paralelo: fan-out con Send. parallel_mode viaja en el input de cada
            # rama (no es una escritura de estado); el synthesizer combina los outputs.
            logger.info(
                f"[{ctx.workflow_id}] Router '{node_id}': fan-out paralelo → {pending} "
                f"(intents={valid_intents}, outputs previos={outputs_count})"
            )
            return [
                Send(target, {
                    **state,
                    "parallel_mode": True,
                    "current_intent": intent_by_target[target],
                })
                for target in pending
            ]

        return router_condition

    else:
        raise ValueError(
            f"[{ctx.workflow_id}] Condition node '{node_id}': "
            f"mode desconocido '{mode}'. Usar 'switch', 'rules' o 'router'."
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
    # Versionado del contrato del schema (evolución solo aditiva; ver docs/graph-schema.md)
    schema_version = ctx.graph_config.get("schema_version", 1)
    if not isinstance(schema_version, int) or schema_version > SUPPORTED_SCHEMA_VERSION:
        raise ValueError(
            f"[{ctx.workflow_id}] graph_config.schema_version={schema_version} no soportado "
            f"(máximo: {SUPPORTED_SCHEMA_VERSION})"
        )

    nodes_config: List[Dict] = ctx.graph_config.get("nodes", [])
    edges_config: List[Dict] = ctx.graph_config.get("edges", [])
    # Config raíz opcional: motivo/resumen deterministas del handoff, compartida por
    # todos los nodos agent y por el synthesizer (ver docstrings de _make_agent_node
    # y _make_synthesizer_node). Una sola declaración en vez de repetirla por nodo.
    handoff_reason_injection = ctx.graph_config.get("handoff_reason_injection")

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

    # Schema de estado por workflow (reducers de variables declarados en config)
    state_class = _build_state_class(ctx.graph_config.get("variable_reducers"))
    graph = StateGraph(state_class)

    # =========================================================================
    # 1. Agregar nodos al grafo (solo agent y tool; condition se maneja en edges)
    # =========================================================================
    for node in nodes_config:
        node_id = node["id"]
        node_type = node.get("type")

        if node_type == "agent":
            agent_name = node.get("agent", "default")
            output_variable = node.get("output_variable")
            classification_pattern = node.get("classification_pattern")
            max_iterations = node.get("max_iterations", 0)
            disable_tools_if = node.get("disable_tools_if")
            set_variables_on_tool_call = node.get("set_variables_on_tool_call")
            intercept_tools_in_parallel = node.get("intercept_tools_in_parallel")
            handoff_label = node.get("handoff_label")
            silent = bool(node.get("silent", False))
            system_prompt_extra = node.get("system_prompt_extra", "")
            graph.add_node(node_id, _make_agent_node(
                node_id, agent_name, output_variable, ctx, classification_pattern, max_iterations,
                disable_tools_if, set_variables_on_tool_call, intercept_tools_in_parallel,
                handoff_label, handoff_reason_injection, silent, system_prompt_extra
            ))
            logger.debug(f"[{ctx.workflow_id}] Added agent node: '{node_id}' (agent: {agent_name})")

        elif node_type == "tool":
            tool_config = node.get("config", {})
            graph.add_node(node_id, _make_tool_node(node_id, tool_config, ctx))
            logger.debug(f"[{ctx.workflow_id}] Added tool node: '{node_id}'")

        elif node_type == "set_variables":
            node_config = node.get("config", {})
            graph.add_node(node_id, _make_set_variables_node(node_id, node_config, ctx))
            logger.debug(f"[{ctx.workflow_id}] Added set_variables node: '{node_id}'")

        elif node_type == "synthesizer":
            agent_name = node.get("agent", "synthesizer")
            node_config = dict(node.get("config", {}))
            if handoff_reason_injection and "handoff_reason_injection" not in node_config:
                node_config["handoff_reason_injection"] = handoff_reason_injection
            graph.add_node(node_id, _make_synthesizer_node(node_id, agent_name, node_config, ctx))
            logger.debug(f"[{ctx.workflow_id}] Added synthesizer node: '{node_id}' (agent: {agent_name})")

        elif node_type == "condition":
            # Nodo de PRIMERA CLASE: se agrega como pass-through y sus salidas son
            # conditional edges desde él. Así puede ser destino de cualquier arista
            # (incluido el router) y mapea 1:1 a un nodo visual con puertos de salida.
            def _make_passthrough(nid):
                def passthrough(state) -> dict:
                    return {"current_node": nid, "execution_path": [nid]}
                return passthrough

            graph.add_node(node_id, _make_passthrough(node_id))
            graph.add_conditional_edges(
                node_id, _make_condition_function(node_id, node["config"], ctx)
            )
            logger.debug(f"[{ctx.workflow_id}] Added condition node: '{node_id}'")

        else:
            raise ValueError(
                f"[{ctx.workflow_id}] Unknown node type '{node_type}' in node '{node_id}'. "
                f"Supported types: 'agent', 'tool', 'set_variables', 'condition', 'synthesizer'. "
                f"Note: 'agent' nodes support tool calling via max_iterations>0."
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

        # Las conditions son nodos reales: una arista hacia ellas es una arista
        # normal (la bifurcación son los conditional edges DESDE la condition,
        # agregados al crear el nodo). Ambas sintaxis de config siguen válidas.
        graph.add_edge(from_node, to_id)
        logger.debug(f"[{ctx.workflow_id}] Edge: '{from_id}' → '{to_id}'")

    # =========================================================================
    # 3. Compilar
    # =========================================================================
    compiled = graph.compile()

    logger.info(f"[{ctx.workflow_id}] Pipeline graph compiled successfully")

    return compiled
