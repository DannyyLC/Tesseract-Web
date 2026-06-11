"""
Tests para el modo agéntico de los nodos agent en graphs/pipeline_agent.py.

Cubre:
- max_iterations: loop LLM ↔ tools, respuesta final de texto, límite de iteraciones
- disable_tools_if: gating determinista de tools según el estado
- set_variables_on_tool_call: seteo determinista de variables al llamar una tool
- classification_pattern evaluado solo sobre la respuesta final
- compatibilidad hacia atrás (sin max_iterations → single-call, sin load_tools)
"""

import sys
from pathlib import Path
from unittest.mock import patch

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage  # noqa: E402
from core.context import TenantContext  # noqa: E402
from graphs.pipeline_agent import _make_agent_node  # noqa: E402


# ── Fakes / helpers ────────────────────────────────────────────────────────────

class FakeTool:
    """Tool falsa: registra las llamadas y devuelve un resultado scripteado."""

    def __init__(self, name, result="ok", raise_error=False):
        self.name = name
        self.result = result
        self.raise_error = raise_error
        self.calls = []

    def invoke(self, args):
        self.calls.append(args)
        if self.raise_error:
            raise RuntimeError("servicio caído")
        return self.result


class FakeAgenticLLM:
    """LLM falso: devuelve respuestas scripteadas en orden y registra qué tools se enlazaron."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.bound_tool_names = None  # None = bind_tools nunca llamado

    def bind_tools(self, tools):
        self.bound_tool_names = [t.name for t in tools]
        return self

    def invoke(self, messages):
        return self.responses.pop(0)


def tool_call_msg(tool_name, args=None, call_id="call_1"):
    return AIMessage(
        content="",
        tool_calls=[{"name": tool_name, "args": args or {}, "id": call_id, "type": "tool_call"}],
    )


def make_ctx(agents_config=None) -> TenantContext:
    return TenantContext(
        tenant_id="t",
        workflow_id="wf",
        conversation_id="c",
        user_type="internal",
        user_id="u",
        channel="dashboard",
        timezone="UTC",
        agents_config=agents_config or {"ventas": {"system_prompt": "SP", "model": "gpt-4o"}},
        graph_config={},
    )


def build_node(llm, tools, **node_kwargs):
    """Construye un agent node agéntico con LLM y tools falsas."""
    ctx = make_ctx()
    with patch("graphs.pipeline_agent.get_llm", return_value=llm), \
         patch("graphs.pipeline_agent.load_tools", return_value=tools):
        return _make_agent_node(
            "agent_ventas", "ventas",
            node_kwargs.pop("output_variable", None),
            ctx,
            node_kwargs.pop("classification_pattern", None),
            node_kwargs.pop("max_iterations", 3),
            node_kwargs.pop("disable_tools_if", None),
            node_kwargs.pop("set_variables_on_tool_call", None),
        )


def run(node, variables=None):
    return node({
        "messages": [HumanMessage(content="quiero contratar")],
        "variables": variables or {},
        "execution_path": [],
    })


# ── Loop agéntico básico ────────────────────────────────────────────────────────

class TestAgenticLoop:

    def test_tool_call_then_text(self):
        tool = FakeTool("send_bulk_whatsapp", result="enviado")
        llm = FakeAgenticLLM([
            tool_call_msg("send_bulk_whatsapp", {"messages": [{"to": "+521"}]}),
            AIMessage(content="Un especialista te contactará."),
        ])
        upd = run(build_node(llm, [tool]))

        assert tool.calls == [{"messages": [{"to": "+521"}]}]
        # mensajes: AIMessage(tool_calls) + ToolMessage + respuesta final
        assert isinstance(upd["messages"][0], AIMessage)
        assert isinstance(upd["messages"][1], ToolMessage)
        assert upd["messages"][1].content == "enviado"
        assert upd["messages"][-1].content == "Un especialista te contactará."

    def test_text_only_no_tool_calls(self):
        tool = FakeTool("send_bulk_whatsapp")
        llm = FakeAgenticLLM([AIMessage(content="Respuesta directa.")])
        upd = run(build_node(llm, [tool]))

        assert tool.calls == []
        assert len(upd["messages"]) == 1
        assert upd["messages"][-1].content == "Respuesta directa."

    def test_max_iterations_forces_final_text(self):
        tool = FakeTool("send_bulk_whatsapp", raise_error=True)
        llm = FakeAgenticLLM([
            tool_call_msg("send_bulk_whatsapp"),          # intento 1 → falla
            tool_call_msg("send_bulk_whatsapp"),          # intento 2 → falla
            AIMessage(content="No pude enviar; contacta al 555."),  # final forzado sin tools
        ])
        upd = run(build_node(llm, [tool], max_iterations=2))

        assert len(tool.calls) == 2
        assert upd["messages"][-1].content == "No pude enviar; contacta al 555."

    def test_tool_error_returned_as_tool_message(self):
        tool = FakeTool("send_bulk_whatsapp", raise_error=True)
        llm = FakeAgenticLLM([
            tool_call_msg("send_bulk_whatsapp"),
            AIMessage(content="Hubo un problema."),
        ])
        upd = run(build_node(llm, [tool]))

        tool_msgs = [m for m in upd["messages"] if isinstance(m, ToolMessage)]
        assert len(tool_msgs) == 1
        assert "servicio caído" in tool_msgs[0].content

    def test_classification_pattern_on_final_text_only(self):
        tool = FakeTool("get_info", result="dato")
        llm = FakeAgenticLLM([
            tool_call_msg("get_info"),
            AIMessage(content="Esto es de otra área. [ROUTE:soporte]"),
        ])
        node = build_node(
            llm, [tool],
            output_variable="intent",
            classification_pattern=r"\[ROUTE:(\w+)\]",
        )
        upd = run(node)

        assert upd["variables"]["intent"] == "soporte"
        assert upd["messages"][-1].content == "Esto es de otra área."


# ── disable_tools_if ────────────────────────────────────────────────────────────

GATE = [{"tool": "send_bulk_whatsapp", "field": "variables.handoff_done", "op": "eq", "value": True}]


class TestDisableToolsIf:

    def test_tool_bound_when_rule_does_not_match(self):
        tool = FakeTool("send_bulk_whatsapp")
        llm = FakeAgenticLLM([AIMessage(content="hola")])
        run(build_node(llm, [tool], disable_tools_if=GATE))

        assert llm.bound_tool_names == ["send_bulk_whatsapp"]

    def test_tool_not_bound_when_rule_matches(self):
        tool = FakeTool("send_bulk_whatsapp")
        other = FakeTool("otra_tool")
        llm = FakeAgenticLLM([AIMessage(content="hola")])
        run(build_node(llm, [tool, other], disable_tools_if=GATE),
            variables={"handoff_done": True})

        # solo la otra tool queda enlazada en runtime
        assert llm.bound_tool_names == ["otra_tool"]

    def test_rule_without_tool_disables_all(self):
        tools = [FakeTool("a"), FakeTool("b")]
        llm = FakeAgenticLLM([AIMessage(content="hola")])
        gate_all = [{"field": "variables.handoff_done", "op": "eq", "value": True}]
        # bind inicial al construir el grafo registra todas; el gating de runtime no re-enlaza
        node = build_node(llm, tools, disable_tools_if=gate_all)
        llm.bound_tool_names = None  # reset: detectar si runtime hizo bind
        run(node, variables={"handoff_done": True})

        # todas deshabilitadas → no se llama bind_tools en runtime (LLM pelón)
        assert llm.bound_tool_names is None


# ── set_variables_on_tool_call ──────────────────────────────────────────────────

SET_ON_CALL = {"send_bulk_whatsapp": {"handoff_done": True}}


class TestSetVariablesOnToolCall:

    def test_sets_variable_on_successful_call(self):
        tool = FakeTool("send_bulk_whatsapp", result="enviado")
        llm = FakeAgenticLLM([
            tool_call_msg("send_bulk_whatsapp"),
            AIMessage(content="Listo."),
        ])
        upd = run(build_node(llm, [tool], set_variables_on_tool_call=SET_ON_CALL))

        assert upd["variables"]["handoff_done"] is True

    def test_sets_variable_even_when_tool_fails(self):
        tool = FakeTool("send_bulk_whatsapp", raise_error=True)
        llm = FakeAgenticLLM([
            tool_call_msg("send_bulk_whatsapp"),
            AIMessage(content="Falló, contacta al 555."),
        ])
        upd = run(build_node(llm, [tool], set_variables_on_tool_call=SET_ON_CALL))

        assert upd["variables"]["handoff_done"] is True

    def test_unlisted_tool_does_not_set(self):
        tool = FakeTool("otra_tool")
        llm = FakeAgenticLLM([
            tool_call_msg("otra_tool"),
            AIMessage(content="Listo."),
        ])
        upd = run(build_node(llm, [tool], set_variables_on_tool_call=SET_ON_CALL))

        assert "handoff_done" not in upd.get("variables", {})


# ── Compatibilidad hacia atrás ──────────────────────────────────────────────────

class TestBackwardCompatibility:

    def test_no_max_iterations_never_loads_tools(self):
        llm = FakeAgenticLLM([AIMessage(content="single call")])
        ctx = make_ctx()
        with patch("graphs.pipeline_agent.get_llm", return_value=llm), \
             patch("graphs.pipeline_agent.load_tools") as mock_load:
            node = _make_agent_node("n", "ventas", None, ctx)
        upd = run(node)

        mock_load.assert_not_called()
        assert llm.bound_tool_names is None  # bind_tools nunca llamado
        assert upd["messages"][-1].content == "single call"

    def test_max_iterations_but_no_tools_behaves_single_call(self):
        llm = FakeAgenticLLM([AIMessage(content="sin tools")])
        node = build_node(llm, [], max_iterations=3)
        upd = run(node)

        assert upd["messages"][-1].content == "sin tools"
