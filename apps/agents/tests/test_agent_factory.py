"""
Tests para core/agent_factory.py.

Cubre:
- get_available_graph_types()
- create_agent_graph() — rutas felices y de error
"""

import pytest
import sys
from pathlib import Path
from unittest.mock import patch, Mock

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from core.context import TenantContext
from core.agent_factory import (
    create_agent_graph,
    get_available_graph_types,
    GRAPH_BUILDERS,
)


# ──────────────────────────────────────────────
# Fixture helper
# ──────────────────────────────────────────────

def make_ctx(**kwargs) -> TenantContext:
    defaults = dict(
        tenant_id="test-tenant",
        workflow_id="test-workflow",
        conversation_id="test-conv",
        user_type="internal",
        user_id="test-user",
        channel="dashboard",
    )
    defaults.update(kwargs)
    return TenantContext(**defaults)


# ──────────────────────────────────────────────
# get_available_graph_types
# ──────────────────────────────────────────────

class TestGetAvailableGraphTypes:

    def test_returns_list(self):
        result = get_available_graph_types()
        assert isinstance(result, list)

    def test_contains_react(self):
        assert "react" in get_available_graph_types()

    def test_matches_graph_builders_registry(self):
        assert set(get_available_graph_types()) == set(GRAPH_BUILDERS.keys())

    def test_returns_strings(self):
        for t in get_available_graph_types():
            assert isinstance(t, str)


# ──────────────────────────────────────────────
# create_agent_graph
# ──────────────────────────────────────────────

class TestCreateAgentGraph:

    def test_raises_value_error_if_no_graph_type(self):
        ctx = make_ctx(graph_config={})
        with pytest.raises(ValueError, match="graph_config must include 'type'"):
            create_agent_graph(ctx)

    def test_raises_value_error_for_unknown_type(self):
        ctx = make_ctx(graph_config={"type": "tipo_inexistente"})
        with pytest.raises(ValueError, match="Unknown graph_type"):
            create_agent_graph(ctx)

    def test_error_message_includes_available_types(self):
        ctx = make_ctx(graph_config={"type": "malo"})
        with pytest.raises(ValueError) as exc_info:
            create_agent_graph(ctx)
        assert "react" in str(exc_info.value)

    def test_calls_react_builder_and_returns_graph(self):
        # GRAPH_BUILDERS captura la referencia al importarse: se parchea el dict
        mock_graph = Mock()
        mock_react = Mock(return_value=mock_graph)
        mock_react.__name__ = "mock_react"

        ctx = make_ctx(graph_config={"type": "react"})
        with patch.dict(GRAPH_BUILDERS, {"react": mock_react}):
            result = create_agent_graph(ctx)

        mock_react.assert_called_once_with(ctx)
        assert result is mock_graph

    def test_builder_exception_propagates(self):
        mock_react = Mock(side_effect=RuntimeError("builder falló"))
        mock_react.__name__ = "mock_react"

        ctx = make_ctx(graph_config={"type": "react"})
        with patch.dict(GRAPH_BUILDERS, {"react": mock_react}):
            with pytest.raises(RuntimeError, match="builder falló"):
                create_agent_graph(ctx)

    def test_passes_full_context_to_builder(self):
        mock_react = Mock(return_value=Mock())
        mock_react.__name__ = "mock_react"

        ctx = make_ctx(
            graph_config={"type": "react"},
            agents_config={"default": {"system_prompt": "Hola"}},
        )
        with patch.dict(GRAPH_BUILDERS, {"react": mock_react}):
            create_agent_graph(ctx)

        call_arg = mock_react.call_args[0][0]
        assert call_arg is ctx
