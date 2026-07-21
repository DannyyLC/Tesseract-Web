"""
Estado del pipeline: canales, reducers y construcción del schema por workflow.
"""

import logging
import operator
from typing import Annotated, Any, Dict, List

from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

from graphs.pipeline.templating import join_dedup

logger = logging.getLogger(__name__)

# Tag de LangChain que marca las llamadas LLM cuyos tokens NO deben streamearse
# al usuario (especialistas en modo paralelo, nodos silent). El servicer filtra
# por este tag.
NO_STREAM_TAG = "pipeline_no_stream"

# Versión máxima del contrato de graph_config que este motor soporta.
# La evolución del schema es SOLO ADITIVA (ver docs/graph-schema.md).
SUPPORTED_SCHEMA_VERSION = 1


def _merge_variables(left: Dict[str, Any] | None, right: Dict[str, Any] | None) -> Dict[str, Any]:
    """
    Reducer default del canal `variables`: merge superficial de DELTAS.

    Cada nodo escribe solo las claves que cambió (no una copia completa del dict);
    con ramas paralelas, claves distintas se combinan y la misma clave escrita por
    dos ramas en el mismo superstep queda en last-writer-wins (orden de los Send).
    No apoyar lógica de negocio en ese orden — para semántica de merge por clave,
    declarar graph_config.variable_reducers.
    """
    return {**(left or {}), **(right or {})}


def make_variables_reducer(reducers_cfg: Dict[str, Any] | None):
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
                out[key] = join_dedup([out[key], value], separator)
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


class PipelineAgentState(TypedDict):
    """
    Estado compartido entre todos los nodos del pipeline.

    Campos:
        messages:        Historial de mensajes acumulado (reducer: concatena)
        variables:       Bus de datos entre nodos. Los nodos escriben DELTAS (solo las
                         claves que cambian); el reducer las mergea según
                         graph_config.variable_reducers (default: last-writer-wins).
        current_node:    ID del último nodo ejecutado (para logging/debug)
        execution_path:  Secuencia de nodos ejecutados en esta corrida (cada nodo
                         aporta [su_id]; el reducer concatena)
        iteration_count: Contador de seguridad para prevenir loops infinitos
        specialist_outputs: Respuestas de especialistas ejecutados en modo paralelo:
                         [{node_id, agent, intent, content, usage_metadata,
                           response_metadata}]. El synthesizer las combina en una
                         sola respuesta. No se persiste entre turnos.
        internal_usage:  Usage de llamadas LLM de nodos silent (que no escriben
                         messages ni specialist_outputs), para el accounting del
                         servicer. No se persiste entre turnos.
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
    internal_usage: Annotated[list, operator.add]
    parallel_mode: bool
    current_intent: str


def build_state_class(variable_reducers: Dict[str, Any] | None):
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
        "variables": Annotated[Dict[str, Any], make_variables_reducer(variable_reducers)],
        "current_node": Annotated[str, _keep_last],
        "execution_path": Annotated[List[str], operator.add],
        "iteration_count": int,
        "specialist_outputs": Annotated[list, operator.add],
        "internal_usage": Annotated[list, operator.add],
        "parallel_mode": bool,
        "current_intent": str,
    })


def initial_state(messages: list, variables: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """
    Estado inicial de una ejecución del pipeline. El servicer lo usa para no
    conocer los canales internos del grafo.
    """
    return {
        "messages": messages,
        "variables": variables or {},
        "current_node": "",
        "execution_path": [],
        "iteration_count": 0,
        "specialist_outputs": [],
        "internal_usage": [],
        "parallel_mode": False,
    }
