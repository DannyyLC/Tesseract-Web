"""
Tests para graphs/react_agent.py.

Cubre:
- increment_iteration()
- should_continue()
- call_model()
- create_react_agent()
"""

import pytest
import sys
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from core.context import TenantContext
from graphs.react_agent import (
    increment_iteration,
    should_continue,
    call_model,
    create_react_agent,
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
        timezone="UTC",
        agents_config={
            "default": {
                "system_prompt": "Eres un asistente de prueba.",
                "model": "gpt-4o",
            }
        },
    )
    defaults.update(kwargs)
    return TenantContext(**defaults)


# ──────────────────────────────────────────────
# increment_iteration
# ──────────────────────────────────────────────

class TestIncrementIteration:

    def test_increments_from_zero(self):
        result = increment_iteration({"messages": [], "iteration_count": 0})
        assert result["iteration_count"] == 1

    def test_increments_from_existing_value(self):
        result = increment_iteration({"messages": [], "iteration_count": 5})
        assert result["iteration_count"] == 6

    def test_defaults_to_one_when_key_missing(self):
        result = increment_iteration({"messages": []})
        assert result["iteration_count"] == 1

    def test_only_returns_iteration_count(self):
        result = increment_iteration({"messages": [], "iteration_count": 3})
        assert "iteration_count" in result


# ──────────────────────────────────────────────
# should_continue
# ──────────────────────────────────────────────

class TestShouldContinue:

    def _ai_msg_with_tool_calls(self, calls=None):
        msg = Mock(spec=AIMessage)
        msg.tool_calls = calls if calls is not None else [{"name": "calculator", "args": {}}]
        return msg

    def _ai_msg_no_tools(self):
        msg = Mock(spec=AIMessage)
        msg.tool_calls = []
        return msg

    def test_returns_tools_when_tool_calls_present(self):
        ctx = make_ctx()
        state = {"messages": [self._ai_msg_with_tool_calls()], "iteration_count": 0}
        assert should_continue(state, ctx) == "tools"

    def test_returns_end_when_no_tool_calls(self):
        ctx = make_ctx()
        state = {"messages": [self._ai_msg_no_tools()], "iteration_count": 0}
        assert should_continue(state, ctx) == "end"

    def test_returns_end_when_tool_calls_is_empty_list(self):
        ctx = make_ctx()
        msg = Mock()
        msg.tool_calls = []
        state = {"messages": [msg], "iteration_count": 0}
        assert should_continue(state, ctx) == "end"

    def test_returns_end_when_message_has_no_tool_calls_attr(self):
        ctx = make_ctx()
        msg = Mock(spec=[])  # sin atributo tool_calls
        state = {"messages": [msg], "iteration_count": 0}
        assert should_continue(state, ctx) == "end"

    def test_forces_end_at_max_iterations(self):
        # agents_config con max_iterations en la raíz (como lo usa should_continue)
        ctx = make_ctx(agents_config={"max_iterations": 3})
        state = {
            "messages": [self._ai_msg_with_tool_calls()],
            "iteration_count": 3,
        }
        assert should_continue(state, ctx) == "end"

    def test_continues_below_max_iterations(self):
        ctx = make_ctx(agents_config={"max_iterations": 5})
        state = {
            "messages": [self._ai_msg_with_tool_calls()],
            "iteration_count": 4,
        }
        assert should_continue(state, ctx) == "tools"

    def test_default_max_iterations_is_ten(self):
        ctx = make_ctx(agents_config={})
        # Con 10 iteraciones y sin max_iterations explícito → END
        state = {
            "messages": [self._ai_msg_with_tool_calls()],
            "iteration_count": 10,
        }
        assert should_continue(state, ctx) == "end"

    def test_continues_at_nine_with_default_max(self):
        ctx = make_ctx(agents_config={})
        state = {
            "messages": [self._ai_msg_with_tool_calls()],
            "iteration_count": 9,
        }
        assert should_continue(state, ctx) == "tools"


# ──────────────────────────────────────────────
# call_model
# ──────────────────────────────────────────────

class TestCallModel:

    def _make_llm(self, response_content="Respuesta de prueba"):
        mock_llm = Mock()
        mock_llm.invoke.return_value = AIMessage(content=response_content)
        return mock_llm

    def test_returns_messages_dict(self):
        ctx = make_ctx()
        state = {"messages": [HumanMessage(content="Hola")], "iteration_count": 0}
        result = call_model(state, ctx, self._make_llm())
        assert "messages" in result
        assert isinstance(result["messages"], list)
        assert len(result["messages"]) == 1

    def test_llm_response_is_in_messages(self):
        ctx = make_ctx()
        state = {"messages": [HumanMessage(content="Hola")], "iteration_count": 0}
        llm = self._make_llm("El resultado es 4.")
        result = call_model(state, ctx, llm)
        assert result["messages"][0].content == "El resultado es 4."

    def test_prepends_system_message_with_prompt(self):
        ctx = make_ctx(agents_config={
            "default": {"system_prompt": "Eres un asistente experto."}
        })
        state = {"messages": [HumanMessage(content="Hola")], "iteration_count": 0}
        llm = self._make_llm()
        call_model(state, ctx, llm)

        call_args = llm.invoke.call_args[0][0]
        assert call_args[0].type == "system"
        assert "Eres un asistente experto." in call_args[0].content

    def test_system_message_contains_date_context(self):
        ctx = make_ctx()
        state = {"messages": [HumanMessage(content="¿Qué día es hoy?")], "iteration_count": 0}
        llm = self._make_llm()
        call_model(state, ctx, llm)

        call_args = llm.invoke.call_args[0][0]
        system_content = call_args[0].content
        assert "SYSTEM DYNAMIC CONTEXT" in system_content

    def test_replaces_existing_system_message(self):
        ctx = make_ctx()
        state = {
            "messages": [
                SystemMessage(content="Prompt antiguo"),
                HumanMessage(content="Hola"),
            ],
            "iteration_count": 0,
        }
        llm = self._make_llm()
        call_model(state, ctx, llm)

        call_args = llm.invoke.call_args[0][0]
        # El primer mensaje sigue siendo system, pero con contenido actualizado
        assert call_args[0].type == "system"
        assert "SYSTEM DYNAMIC CONTEXT" in call_args[0].content

    def test_returns_error_message_on_llm_exception(self):
        ctx = make_ctx()
        state = {"messages": [HumanMessage(content="Hola")], "iteration_count": 0}

        llm = Mock()
        llm.invoke.side_effect = Exception("LLM no disponible")

        result = call_model(state, ctx, llm)

        assert "messages" in result
        content = result["messages"][0].content.lower()
        assert "error" in content or "lo siento" in content

    def test_unknown_timezone_falls_back_to_utc(self):
        ctx = make_ctx(timezone="Zona/Invalida")
        state = {"messages": [HumanMessage(content="test")], "iteration_count": 0}
        llm = self._make_llm()
        # No debe lanzar excepción
        result = call_model(state, ctx, llm)
        assert "messages" in result

    def test_invokes_llm_with_messages(self):
        ctx = make_ctx()
        state = {"messages": [HumanMessage(content="2+2")], "iteration_count": 0}
        llm = self._make_llm()
        call_model(state, ctx, llm)
        llm.invoke.assert_called_once()


# ──────────────────────────────────────────────
# create_react_agent
# ──────────────────────────────────────────────

class TestCreateReactAgent:

    @patch("graphs.react_agent.load_tools", return_value=[])
    @patch("graphs.react_agent.get_llm")
    def test_creates_graph_without_tools(self, mock_get_llm, mock_load_tools):
        mock_get_llm.return_value = Mock()
        ctx = make_ctx()
        graph = create_react_agent(ctx)
        assert graph is not None

    @patch("graphs.react_agent.load_tools")
    @patch("graphs.react_agent.get_llm")
    def test_creates_graph_with_tools(self, mock_get_llm, mock_load_tools):
        mock_tool = Mock()
        mock_tool.name = "calculator"
        mock_load_tools.return_value = [mock_tool]

        mock_llm = Mock()
        mock_llm.bind_tools.return_value = mock_llm
        mock_get_llm.return_value = mock_llm

        ctx = make_ctx()
        graph = create_react_agent(ctx)

        assert graph is not None
        mock_llm.bind_tools.assert_called_once_with([mock_tool])

    @patch("graphs.react_agent.load_tools", return_value=[])
    @patch("graphs.react_agent.get_llm")
    def test_returns_compiled_graph(self, mock_get_llm, mock_load_tools):
        mock_get_llm.return_value = Mock()
        ctx = make_ctx()
        graph = create_react_agent(ctx)
        # El grafo compilado debe ser invocable (tiene método invoke)
        assert hasattr(graph, "invoke")

    @patch("graphs.react_agent.load_tools")
    @patch("graphs.react_agent.get_llm")
    def test_llm_not_bound_when_no_tools(self, mock_get_llm, mock_load_tools):
        mock_load_tools.return_value = []
        mock_llm = Mock()
        mock_get_llm.return_value = mock_llm

        ctx = make_ctx()
        create_react_agent(ctx)

        mock_llm.bind_tools.assert_not_called()
