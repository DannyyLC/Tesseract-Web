"""
Tests para core/agent_factory.py.

Cubre:
- get_available_graph_types()
- validate_graph_config()
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
    validate_graph_config,
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
# validate_graph_config
# ──────────────────────────────────────────────

class TestValidateGraphConfig:

    def test_react_valid(self):
        valid, error = validate_graph_config("react", {"graph_type": "react"})
        assert valid is True
        assert error == ""

    def test_graph_type_mismatch_returns_false(self):
        valid, error = validate_graph_config("react", {"graph_type": "router"})
        assert valid is False
        assert "mismatch" in error

    def test_router_without_routes_invalid(self):
        valid, error = validate_graph_config("router", {"graph_type": "router"})
        assert valid is False
        assert "routes" in error

    def test_router_with_routes_valid(self):
        valid, error = validate_graph_config(
            "router", {"graph_type": "router", "routes": ["a", "b"]}
        )
        assert valid is True

    def test_sequential_without_steps_invalid(self):
        valid, error = validate_graph_config("sequential", {"graph_type": "sequential"})
        assert valid is False
        assert "steps" in error

    def test_sequential_steps_not_list_invalid(self):
        valid, error = validate_graph_config(
            "sequential", {"graph_type": "sequential", "steps": "not-a-list"}
        )
        assert valid is False

    def test_sequential_with_steps_valid(self):
        valid, error = validate_graph_config(
            "sequential", {"graph_type": "sequential", "steps": ["step1", "step2"]}
        )
        assert valid is True

    def test_supervisor_without_agents_invalid(self):
        valid, error = validate_graph_config("supervisor", {"graph_type": "supervisor"})
        assert valid is False
        assert "agents" in error

    def test_supervisor_with_agents_valid(self):
        valid, error = validate_graph_config(
            "supervisor", {"graph_type": "supervisor", "agents": ["a1"]}
        )
        assert valid is True

    def test_unknown_type_with_matching_graph_type_valid(self):
        """Tipos no específicamente validados pasan si graph_type coincide."""
        valid, error = validate_graph_config(
            "custom_type", {"graph_type": "custom_type"}
        )
        assert valid is True


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

    @patch("core.agent_factory.create_react_agent")
    def test_calls_react_builder_and_returns_graph(self, mock_react):
        mock_graph = Mock()
        mock_react.return_value = mock_graph

        ctx = make_ctx(graph_config={"type": "react"})
        result = create_agent_graph(ctx)

        mock_react.assert_called_once_with(ctx)
        assert result is mock_graph

    @patch("core.agent_factory.create_react_agent")
    def test_builder_exception_propagates(self, mock_react):
        mock_react.side_effect = RuntimeError("builder falló")

        ctx = make_ctx(graph_config={"type": "react"})
        with pytest.raises(RuntimeError, match="builder falló"):
            create_agent_graph(ctx)

    @patch("core.agent_factory.create_react_agent")
    def test_passes_full_context_to_builder(self, mock_react):
        mock_react.return_value = Mock()

        ctx = make_ctx(
            graph_config={"type": "react"},
            agents_config={"default": {"system_prompt": "Hola"}},
        )
        create_agent_graph(ctx)

        call_arg = mock_react.call_args[0][0]
        assert call_arg is ctx
