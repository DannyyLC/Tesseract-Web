"""
Pipeline: grafo dinámico construido desde configuración.

API pública del paquete. El contrato del graph_config está en docs/graph-schema.md.
"""

from graphs.pipeline.builder import create_pipeline_agent
from graphs.pipeline.catalog import get_node_catalog
from graphs.pipeline.conditions import evaluate_condition, make_condition_function
from graphs.pipeline.nodes import (
    make_agent_node,
    make_set_variables_node,
    make_synthesizer_node,
    make_tool_node,
)
from graphs.pipeline.nodes.agent import tool_base_name, tool_name_matches
from graphs.pipeline.routing import extract_intents, make_router_condition, normalize_intents
from graphs.pipeline.state import (
    NO_STREAM_TAG,
    SUPPORTED_SCHEMA_VERSION,
    PipelineAgentState,
    build_state_class,
    initial_state,
    make_variables_reducer,
)
from graphs.pipeline.templating import (
    join_dedup,
    render_params,
    render_template_value,
    resolve_path,
)

__all__ = [
    "NO_STREAM_TAG",
    "SUPPORTED_SCHEMA_VERSION",
    "PipelineAgentState",
    "build_state_class",
    "create_pipeline_agent",
    "evaluate_condition",
    "extract_intents",
    "get_node_catalog",
    "initial_state",
    "join_dedup",
    "make_agent_node",
    "make_condition_function",
    "make_router_condition",
    "make_set_variables_node",
    "make_synthesizer_node",
    "make_tool_node",
    "make_variables_reducer",
    "normalize_intents",
    "render_params",
    "render_template_value",
    "resolve_path",
    "tool_base_name",
    "tool_name_matches",
]
