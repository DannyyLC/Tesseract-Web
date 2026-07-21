"""
Tests de las primitivas generales del pipeline (Fase 2):

- Templating universal: namespace {{context.*}}, namespaces desconocidos literales,
  system_prompt y system_prompt_extra con templates
- variable_reducers declarados en graph_config (join / append / last)
- Signal tools por config (tools/signals.py + registry)
- Nodos agent silent (salida solo a variable, NO_STREAM_TAG, internal_usage)
- Conditions de primera clase (nodo real, destino de router) + end_node
- schema_version
"""

import sys
from pathlib import Path
from unittest.mock import patch

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

import pytest  # noqa: E402
from langchain_core.messages import AIMessage, HumanMessage  # noqa: E402
from core.context import TenantContext  # noqa: E402
from graphs.pipeline_agent import (  # noqa: E402
    NO_STREAM_TAG,
    _render_template_value,
    _resolve_path,
    _make_variables_reducer,
    _make_agent_node,
    create_pipeline_agent,
)


# ── Fakes ───────────────────────────────────────────────────────────────────────

class FakeLLM:
    def __init__(self, content):
        self._content = content
        self.invoke_configs = []
        self.seen_system = None

    def bind_tools(self, tools):
        return self

    def invoke(self, messages, config=None):
        self.invoke_configs.append(config)
        if messages and getattr(messages[0], "type", "") == "system":
            self.seen_system = messages[0].content
        response = AIMessage(content=self._content)
        response.usage_metadata = {"input_tokens": 10, "output_tokens": 5}
        return response


def make_ctx(graph_config=None, agents_config=None, user_metadata=None):
    return TenantContext(
        tenant_id="t", workflow_id="wf", conversation_id="c",
        user_type="external", user_id="u", channel="whatsapp",
        timezone="UTC",
        graph_config=graph_config or {},
        agents_config=agents_config or {"a": {"model": "gpt-4o", "system_prompt": "SP"}},
        user_metadata=user_metadata or {},
    )


def initial_state(message="hola", variables=None, **overrides):
    state = {
        "messages": [HumanMessage(content=message)],
        "variables": variables or {},
        "current_node": "",
        "execution_path": [],
        "iteration_count": 0,
        "specialist_outputs": [],
        "pending_handoffs": [],
        "collected_variables": [],
        "internal_usage": [],
        "parallel_mode": False,
    }
    state.update(overrides)
    return state


# ── Templating: namespace context + literales desconocidos ──────────────────────

class TestTemplatingContext:

    def test_context_user_metadata_resolves(self):
        ctx = make_ctx(user_metadata={"client_number": "+52123"})
        out = _render_template_value(
            "Cliente: {{context.user_metadata.client_number}}", initial_state(), ctx
        )
        assert out == "Cliente: +52123"

    def test_context_full_template_preserves_type(self):
        ctx = make_ctx(user_metadata={"tags": ["a", "b"]})
        out = _render_template_value("{{context.user_metadata.tags}}", initial_state(), ctx)
        assert out == ["a", "b"]

    def test_context_scalar_fields(self):
        ctx = make_ctx()
        state = initial_state()
        assert _render_template_value("{{context.channel}}", state, ctx) == "whatsapp"
        assert _render_template_value("{{context.user_id}}", state, ctx) == "u"
        assert _render_template_value("{{context.conversation_id}}", state, ctx) == "c"

    def test_unknown_namespace_left_literal(self):
        # Placeholders tipo Meta ("{{1}}") en prompts NO deben destruirse
        out = _render_template_value("Usa el formato {{1}} y {{2}}", initial_state(), make_ctx())
        assert out == "Usa el formato {{1}} y {{2}}"

    def test_unknown_full_template_left_literal(self):
        out = _render_template_value("{{cosa.rara}}", initial_state(), make_ctx())
        assert out == "{{cosa.rara}}"

    def test_variables_missing_still_renders_empty(self):
        # Comportamiento clásico: variables.* conocido pero sin valor → vacío
        out = _render_template_value("Hola {{variables.nombre}}", initial_state(), make_ctx())
        assert out == "Hola "

    def test_resolve_path_context_disallows_private_fields(self):
        ctx = make_ctx()
        assert _resolve_path(initial_state(), "context.streaming", ctx) is None

    def test_system_prompt_renders_templates(self):
        ctx = make_ctx(agents_config={
            "a": {"model": "gpt-4o",
                  "system_prompt": "Atiendes a {{context.user_metadata.name}}."},
        }, user_metadata={"name": "Carlos"})
        llm = FakeLLM("ok")
        with patch("graphs.pipeline_agent.get_llm", return_value=llm):
            node = _make_agent_node("n", "a", None, ctx)
        node(initial_state())
        assert "Atiendes a Carlos." in llm.seen_system

    def test_system_prompt_extra_appended_when_set(self):
        ctx = make_ctx()
        llm = FakeLLM("ok")
        with patch("graphs.pipeline_agent.get_llm", return_value=llm):
            node = _make_agent_node(
                "n", "a", None, ctx,
                system_prompt_extra="{{variables.notice}}",
            )
        node(initial_state(variables={"notice": "AVISO IMPORTANTE"}))
        assert "AVISO IMPORTANTE" in llm.seen_system

    def test_system_prompt_extra_empty_adds_nothing(self):
        ctx = make_ctx()
        llm = FakeLLM("ok")
        with patch("graphs.pipeline_agent.get_llm", return_value=llm):
            node = _make_agent_node(
                "n", "a", None, ctx,
                system_prompt_extra="{{variables.notice}}",
            )
        node(initial_state())
        assert llm.seen_system.count("\n\n") <= 1  # solo el time-context


# ── variable_reducers ───────────────────────────────────────────────────────────

class TestVariableReducers:

    def test_default_last_wins(self):
        reducer = _make_variables_reducer({})
        assert reducer({"a": 1}, {"a": 2}) == {"a": 2}

    def test_join_mode_joins_with_separator(self):
        reducer = _make_variables_reducer({"urls": {"mode": "join", "separator": ","}})
        out = reducer({"urls": "a"}, {"urls": "b"})
        assert out == {"urls": "a,b"}

    def test_join_mode_dedups(self):
        reducer = _make_variables_reducer({"urls": {"mode": "join", "separator": ","}})
        assert reducer({"urls": "a"}, {"urls": "a"}) == {"urls": "a"}

    def test_join_first_write_sets_plain_value(self):
        reducer = _make_variables_reducer({"urls": {"mode": "join"}})
        assert reducer({}, {"urls": "a"}) == {"urls": "a"}

    def test_append_mode_accumulates_list(self):
        reducer = _make_variables_reducer({"hits": {"mode": "append"}})
        out = reducer({"hits": ["x"]}, {"hits": "y"})
        assert out == {"hits": ["x", "y"]}

    def test_non_declared_keys_still_last_wins(self):
        reducer = _make_variables_reducer({"urls": {"mode": "join"}})
        assert reducer({"other": 1}, {"other": 2}) == {"other": 2}

    def test_none_overwrites_in_join_mode(self):
        # Escribir None resetea (p.ej. limpiar canal) — no se intenta join
        reducer = _make_variables_reducer({"urls": {"mode": "join"}})
        assert reducer({"urls": "a"}, {"urls": None}) == {"urls": None}

    def test_parallel_branches_join_in_graph(self):
        # Dos ramas paralelas escriben la misma variable declarada como join
        graph_config = {
            "type": "pipeline",
            "variable_reducers": {"topics": {"mode": "join", "separator": ", "}},
            "nodes": [
                {"id": "route", "type": "condition", "config": {
                    "mode": "router",
                    "route_variable": "variables.intent",
                    "routes": {"a": "sa", "b": "sb"},
                    "fallback": "sa",
                    "synthesizer_node": "synth",
                }},
                {"id": "sa", "type": "agent", "agent": "a"},
                {"id": "sb", "type": "agent", "agent": "b"},
                {"id": "synth", "type": "synthesizer", "agent": "synthesizer", "config": {}},
            ],
            "edges": [
                {"from": "START", "to": "route"},
                {"from": "sa", "to": "route"},
                {"from": "sb", "to": "route"},
                {"from": "synth", "to": "END"},
            ],
        }
        agents = {
            "a": {"model": "m", "system_prompt": "x",
                  "signal_tools": [{"name": "sig", "description": "señala"}]},
            "b": {"model": "m", "system_prompt": "x",
                  "signal_tools": [{"name": "sig", "description": "señala"}]},
            "synthesizer": {"model": "m", "system_prompt": "s"},
        }
        # Cada rama setea topics vía set_variables_on_tool_call de su signal tool
        for node in graph_config["nodes"]:
            if node["id"] in ("sa", "sb"):
                node["max_iterations"] = 2
                node["set_variables_on_tool_call"] = {
                    "sig": {"topics": f"tema_{node['id']}"}
                }

        class AgenticFake:
            def __init__(self, responses):
                self._r = list(responses)
                self.invoke_configs = []

            def bind_tools(self, tools):
                return self

            def invoke(self, messages, config=None):
                self.invoke_configs.append(config)
                return self._r.pop(0)

        def sig_call():
            return AIMessage(content="", tool_calls=[
                {"name": "sig", "args": {}, "id": "c1", "type": "tool_call"}
            ])

        llms = {
            "a": AgenticFake([sig_call(), AIMessage(content="ra")]),
            "b": AgenticFake([sig_call(), AIMessage(content="rb")]),
            "synthesizer": FakeLLM("síntesis"),
        }

        from tools.signals import load_signal_tools
        ctx = make_ctx(graph_config=graph_config, agents_config=agents)
        with patch("graphs.pipeline_agent.get_llm", side_effect=lambda _c, n: llms[n]), \
             patch("graphs.pipeline_agent.load_tools",
                   side_effect=lambda _c, n: load_signal_tools(
                       agents[n].get("signal_tools"))):
            graph = create_pipeline_agent(ctx)
            result = graph.invoke(initial_state(variables={"intent": ["a", "b"]}))

        assert result["variables"]["topics"] == "tema_sa, tema_sb"


# ── Signal tools ────────────────────────────────────────────────────────────────

class TestSignalTools:

    def test_builds_tool_with_metadata_and_response(self):
        from tools.signals import load_signal_tools
        tools = load_signal_tools([{
            "name": "solicitar_asesor",
            "description": "Cuando el cliente pida un humano.",
            "response": "Solicitud registrada.",
        }])
        assert len(tools) == 1
        tool = tools[0]
        assert tool.name == "solicitar_asesor"
        assert tool.metadata["base_name"] == "solicitar_asesor"
        assert tool.metadata["signal"] is True
        assert tool.invoke({}) == "Solicitud registrada."

    def test_default_response(self):
        from tools.signals import load_signal_tools
        tools = load_signal_tools([{"name": "s", "description": "d"}])
        assert tools[0].invoke({}) == "Registrado."

    def test_declared_args_accepted(self):
        from tools.signals import load_signal_tools
        tools = load_signal_tools([{
            "name": "s", "description": "d",
            "args": {"detalle": "nota de contexto"},
        }])
        assert tools[0].invoke({"detalle": "cliente urgido"}) == "Registrado."
        assert "detalle" in tools[0].args_schema.model_fields

    def test_invalid_definitions_skipped(self):
        from tools.signals import load_signal_tools
        assert load_signal_tools([{"name": "sin_desc"}, {}]) == []
        assert load_signal_tools(None) == []

    def test_registry_loads_signal_tools_without_instances(self):
        from tools import registry
        ctx = make_ctx(agents_config={
            "a": {"model": "m", "system_prompt": "x",
                  "signal_tools": [{"name": "sig", "description": "d"}]},
        })
        tools = registry.load_tools(ctx, "a")
        assert [t.name for t in tools] == ["sig"]


# ── Nodos silent ────────────────────────────────────────────────────────────────

class TestSilentAgentNode:

    def _run(self, state=None):
        ctx = make_ctx()
        llm = FakeLLM("  resumen interno  ")
        with patch("graphs.pipeline_agent.get_llm", return_value=llm):
            node = _make_agent_node("n", "a", "resumen", ctx, silent=True)
        return node(state or initial_state()), llm

    def test_output_only_to_variable(self):
        upd, _ = self._run()
        assert upd["variables"]["resumen"] == "resumen interno"
        assert "messages" not in upd
        assert "specialist_outputs" not in upd

    def test_always_tagged_no_stream(self):
        _, llm = self._run()
        assert llm.invoke_configs == [{"tags": [NO_STREAM_TAG]}]

    def test_usage_reported_via_internal_usage(self):
        upd, _ = self._run()
        assert upd["internal_usage"][0]["usage_metadata"]["output_tokens"] == 5


# ── Conditions de primera clase + end_node ──────────────────────────────────────

SIMPLE_AGENTS = {
    "a": {"model": "m", "system_prompt": "x"},
    "final": {"model": "m", "system_prompt": "y"},
}


class TestFirstClassConditions:

    def test_condition_appears_in_execution_path(self):
        graph_config = {
            "type": "pipeline",
            "nodes": [
                {"id": "cond", "type": "condition", "config": {
                    "mode": "switch", "source": "variables.x",
                    "branches": {"default": "nodo_a"},
                }},
                {"id": "nodo_a", "type": "agent", "agent": "a"},
            ],
            "edges": [
                {"from": "START", "to": "cond"},
                {"from": "nodo_a", "to": "END"},
            ],
        }
        ctx = make_ctx(graph_config=graph_config, agents_config=SIMPLE_AGENTS)
        with patch("graphs.pipeline_agent.get_llm", return_value=FakeLLM("hola")):
            graph = create_pipeline_agent(ctx)
        result = graph.invoke(initial_state())
        assert result["execution_path"][0] == "cond"
        assert "nodo_a" in result["execution_path"]

    def test_condition_can_be_router_target_via_end_node(self):
        # El router termina el turno en un condition (end_node), que decide si
        # correr un paso final — el patrón de la cadena de handoff del workflow
        graph_config = {
            "type": "pipeline",
            "nodes": [
                {"id": "route", "type": "condition", "config": {
                    "mode": "router",
                    "route_variable": "variables.intent",
                    "routes": {"a": "nodo_a"},
                    "fallback": "nodo_a",
                    "end_node": "check_final",
                }},
                {"id": "nodo_a", "type": "agent", "agent": "a"},
                {"id": "check_final", "type": "condition", "config": {
                    "mode": "rules",
                    "rules": [{"when": {"field": "variables.flag", "op": "eq", "value": True},
                               "goto": "nodo_final"}],
                    "default": "END",
                }},
                {"id": "nodo_final", "type": "agent", "agent": "final"},
            ],
            "edges": [
                {"from": "START", "to": "route"},
                {"from": "nodo_a", "to": "route"},
                {"from": "nodo_final", "to": "END"},
            ],
        }
        llms = {"a": FakeLLM("respuesta a"), "final": FakeLLM("paso final")}
        ctx = make_ctx(graph_config=graph_config, agents_config=SIMPLE_AGENTS)
        with patch("graphs.pipeline_agent.get_llm", side_effect=lambda _c, n: llms[n]):
            graph = create_pipeline_agent(ctx)

        # flag=True → tras el turno corre el paso final
        result = graph.invoke(initial_state(
            variables={"intent": ["a"], "flag": True}
        ))
        assert "check_final" in result["execution_path"]
        assert "nodo_final" in result["execution_path"]

        # flag ausente → el condition cae al default END
        result2 = graph.invoke(initial_state(variables={"intent": ["a"]}))
        assert "check_final" in result2["execution_path"]
        assert "nodo_final" not in result2["execution_path"]

    def test_end_node_visited_only_once(self):
        # Si end_node ya corrió, el router cierra en END (sin loop)
        graph_config = {
            "type": "pipeline",
            "nodes": [
                {"id": "route", "type": "condition", "config": {
                    "mode": "router",
                    "route_variable": "variables.intent",
                    "routes": {"a": "nodo_a"},
                    "fallback": "nodo_a",
                    "end_node": "cierre",
                }},
                {"id": "nodo_a", "type": "agent", "agent": "a"},
                {"id": "cierre", "type": "set_variables",
                 "config": {"variables": {"closed": True}}},
            ],
            "edges": [
                {"from": "START", "to": "route"},
                {"from": "nodo_a", "to": "route"},
                {"from": "cierre", "to": "route"},
            ],
        }
        ctx = make_ctx(graph_config=graph_config, agents_config=SIMPLE_AGENTS)
        with patch("graphs.pipeline_agent.get_llm", return_value=FakeLLM("r")):
            graph = create_pipeline_agent(ctx)
        result = graph.invoke(initial_state(variables={"intent": ["a"]}))
        assert result["execution_path"].count("cierre") == 1
        assert result["variables"]["closed"] is True


# ── schema_version ──────────────────────────────────────────────────────────────

class TestSchemaVersion:

    def _graph_config(self, version=None):
        cfg = {
            "type": "pipeline",
            "nodes": [{"id": "n", "type": "agent", "agent": "a"}],
            "edges": [{"from": "START", "to": "n"}, {"from": "n", "to": "END"}],
        }
        if version is not None:
            cfg["schema_version"] = version
        return cfg

    def test_absent_version_defaults_to_supported(self):
        ctx = make_ctx(graph_config=self._graph_config(), agents_config=SIMPLE_AGENTS)
        with patch("graphs.pipeline_agent.get_llm", return_value=FakeLLM("x")):
            assert create_pipeline_agent(ctx) is not None

    def test_supported_version_accepted(self):
        ctx = make_ctx(graph_config=self._graph_config(1), agents_config=SIMPLE_AGENTS)
        with patch("graphs.pipeline_agent.get_llm", return_value=FakeLLM("x")):
            assert create_pipeline_agent(ctx) is not None

    def test_future_version_rejected(self):
        ctx = make_ctx(graph_config=self._graph_config(99), agents_config=SIMPLE_AGENTS)
        with pytest.raises(ValueError, match="schema_version"):
            create_pipeline_agent(ctx)
