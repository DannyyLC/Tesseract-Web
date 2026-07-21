"""Fábricas de nodos del pipeline."""

from graphs.pipeline.nodes.agent import make_agent_node
from graphs.pipeline.nodes.set_variables import make_set_variables_node
from graphs.pipeline.nodes.synthesizer import make_synthesizer_node
from graphs.pipeline.nodes.tool import make_tool_node

__all__ = [
    "make_agent_node",
    "make_set_variables_node",
    "make_synthesizer_node",
    "make_tool_node",
]
