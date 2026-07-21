"""
Tests para el routing multi-intent con fan-out paralelo + synthesizer.

Cubre:
- extract_intents: tags repetidos, lista con comas, dedup
- normalize_intents: retrocompat string/lista
- clasificador: output_variable siempre lista, reroute_count por cambio de set
- router: modo single (string), fan-out (list[Send]) con tope, reutilización de
  especialistas ya ejecutados, ruta defensiva al synthesizer, anti-loop intacto
- e2e paralelo: un solo AIMessage final, specialist_outputs, sin InvalidUpdateError
- tool_name_matches / base_name en registry.load_tools
- synthesizer: pass-through con 1 output, no-op sin outputs, set_variables
"""

import re
import sys
from pathlib import Path
from unittest.mock import patch

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from langchain_core.messages import AIMessage, HumanMessage  # noqa: E402
from langgraph.types import Send  # noqa: E402
from core.context import TenantContext  # noqa: E402
from graphs.pipeline import (  # noqa: E402
    NO_STREAM_TAG,
    extract_intents,
    normalize_intents,
    tool_name_matches,
    make_agent_node,
    make_condition_function,
    make_synthesizer_node,
    create_pipeline_agent,
)


# ── Fakes / helpers ────────────────────────────────────────────────────────────

class FakeTool:
    """Tool falsa con nombre renombrado (sufijo) y base_name en metadata."""

    def __init__(self, name, base_name=None):
        self.name = name
        self.metadata = {"base_name": base_name} if base_name else {}
        self.calls = []

    def invoke(self, args):
        self.calls.append(args)
        return "ok"


class FakeLLM:
    """LLM falso single-call. Registra el config recibido (para verificar tags)."""

    def __init__(self, content):
        self._content = content
        self.invoke_configs = []

    def invoke(self, messages, config=None):
        self.invoke_configs.append(config)
        return AIMessage(content=self._content)


class FakeAgenticLLM:
    """LLM falso agéntico: consume una cola de respuestas propia (no compartida —
    en ejecución paralela el orden entre agentes es no determinista)."""

    def __init__(self, responses):
        self._responses = list(responses)
        self.bound_tool_names = None
        self.bind_history = []
        self.invoke_configs = []

    def bind_tools(self, tools):
        self.bound_tool_names = [t.name for t in tools]
        self.bind_history.append(self.bound_tool_names)
        return self

    def invoke(self, messages, config=None):
        self.invoke_configs.append(config)
        return self._responses.pop(0)


def tool_call_msg(name, args=None):
    return AIMessage(content="", tool_calls=[
        {"name": name, "args": args or {}, "id": f"call_{name}", "type": "tool_call"}
    ])


def make_ctx(graph_config=None, agents_config=None) -> TenantContext:
    return TenantContext(
        tenant_id="t",
        workflow_id="wf",
        conversation_id="c",
        user_type="internal",
        user_id="u",
        channel="dashboard",
        timezone="UTC",
        agents_config=agents_config or {"classifier": {"system_prompt": "SP", "model": "gpt-4o"}},
        graph_config=graph_config or {},
    )


def initial_state(message="hola", variables=None, **overrides):
    state = {
        "messages": [HumanMessage(content=message)],
        "variables": variables or {},
        "current_node": "",
        "execution_path": [],
        "iteration_count": 0,
        "specialist_outputs": [],
        "internal_usage": [],
        "parallel_mode": False,
    }
    state.update(overrides)
    return state


MULTI_PATTERN = r"\[ROUTE:([\w,\s]+)\]"


# ── extract_intents / normalize_intents ─────────────────────────────────────────

class TestExtractIntents:

    def test_repeated_tags(self):
        pattern = re.compile(MULTI_PATTERN)
        intents, cleaned = extract_intents(pattern, "Ok. [ROUTE:ventas] [ROUTE:soporte]")
        assert intents == ["ventas", "soporte"]
        assert cleaned == "Ok."

    def test_comma_list(self):
        pattern = re.compile(MULTI_PATTERN)
        intents, cleaned = extract_intents(pattern, "[ROUTE:ventas, soporte]")
        assert intents == ["ventas", "soporte"]
        assert cleaned == ""

    def test_dedup_preserves_order(self):
        pattern = re.compile(MULTI_PATTERN)
        intents, _ = extract_intents(pattern, "[ROUTE:soporte,ventas] [ROUTE:soporte]")
        assert intents == ["soporte", "ventas"]

    def test_legacy_pattern_still_works_for_repeated_tags(self):
        # El patrón viejo (\w+) no matchea comas, pero sí tags repetidos
        pattern = re.compile(r"\[ROUTE:(\w+)\]")
        intents, _ = extract_intents(pattern, "[ROUTE:ventas] [ROUTE:soporte]")
        assert intents == ["ventas", "soporte"]


class TestNormalizeIntents:

    def test_none_and_empty(self):
        assert normalize_intents(None) == []
        assert normalize_intents("") == []
        assert normalize_intents([]) == []

    def test_legacy_string(self):
        assert normalize_intents("Ventas") == ["ventas"]

    def test_comma_string(self):
        assert normalize_intents("ventas, soporte") == ["ventas", "soporte"]

    def test_list_with_dedup(self):
        assert normalize_intents(["Ventas", "soporte", "ventas"]) == ["ventas", "soporte"]


# ── Clasificador multi-intent ────────────────────────────────────────────────────

class TestMultiIntentClassifier:

    def _run(self, content, variables=None):
        ctx = make_ctx()
        with patch("tools.registry.get_llm", return_value=FakeLLM(content)):
            node = make_agent_node("classifier", "classifier", "intent", ctx, MULTI_PATTERN)
        return node(initial_state(variables=variables or {}))

    def test_stores_list_even_for_single_intent(self):
        upd = self._run("Va. [ROUTE:ventas]")
        assert upd["variables"]["intent"] == ["ventas"]

    def test_stores_multiple_intents(self):
        upd = self._run("[ROUTE:ventas,soporte]")
        assert upd["variables"]["intent"] == ["ventas", "soporte"]

    def test_reroute_count_increments_on_set_change(self):
        upd = self._run("[ROUTE:ventas,soporte]", variables={"intent": ["ventas"]})
        assert upd["variables"]["reroute_count"] == 1

    def test_reroute_count_not_incremented_on_same_set(self):
        upd = self._run("[ROUTE:soporte,ventas]", variables={"intent": ["ventas", "soporte"]})
        assert "reroute_count" not in upd["variables"]

    def test_same_set_against_legacy_string(self):
        # intent persistido de una config vieja (string) — mismo set → no incrementa
        upd = self._run("[ROUTE:ventas]", variables={"intent": "ventas"})
        assert "reroute_count" not in upd["variables"]

    def test_parallel_mode_skips_extraction(self):
        ctx = make_ctx()
        with patch("tools.registry.get_llm", return_value=FakeLLM("Resp. [ROUTE:otro]")):
            node = make_agent_node("spec", "classifier", "intent", ctx, MULTI_PATTERN)
        upd = node(initial_state(parallel_mode=True, current_intent="ventas"))
        # no re-rutea: no escribe intent ni reroute_count
        assert "intent" not in upd.get("variables", {})
        # el tag se limpia del contenido que va a specialist_outputs
        assert upd["specialist_outputs"][0]["content"] == "Resp."


# ── Router: single / fan-out / anti-loop ────────────────────────────────────────

ROUTER_CFG = {
    "mode": "router",
    "route_variable": "variables.intent",
    "routes": {"ventas": "agent_ventas", "soporte": "agent_soporte", "otros": "agent_otros"},
    "fallback": "classifier",
    "max_reroutes": 3,
    "lock_node": "lock_routing",
    "max_parallel_agents": 2,
    "synthesizer_node": "synthesize",
}


def make_router(cfg=None):
    return make_condition_function("check_route", cfg or ROUTER_CFG, make_ctx())


class TestRouterFanOut:

    def test_single_intent_returns_string(self):
        result = make_router()(initial_state(variables={"intent": ["ventas"]}))
        assert result == "agent_ventas"

    def test_legacy_string_intent_returns_string(self):
        result = make_router()(initial_state(variables={"intent": "ventas"}))
        assert result == "agent_ventas"

    def test_multi_intent_returns_sends_with_parallel_mode(self):
        result = make_router()(initial_state(variables={"intent": ["ventas", "soporte"]}))
        assert isinstance(result, list)
        assert all(isinstance(s, Send) for s in result)
        assert [s.node for s in result] == ["agent_ventas", "agent_soporte"]
        for s in result:
            assert s.arg["parallel_mode"] is True
        assert result[0].arg["current_intent"] == "ventas"
        assert result[1].arg["current_intent"] == "soporte"

    def test_max_parallel_agents_caps_fanout(self):
        result = make_router()(
            initial_state(variables={"intent": ["ventas", "soporte", "otros"]})
        )
        assert [s.node for s in result] == ["agent_ventas", "agent_soporte"]  # cap = 2

    def test_outputs_present_always_converge_to_synthesizer(self):
        # Con specialist_outputs presentes, el fan-out ya corrió en este turno: la
        # única salida válida es converger (la evaluación de edges por rama no ve a
        # las hermanas; re-evaluar pending aquí duplicaría especialistas)
        state = initial_state(
            variables={"intent": ["ventas", "soporte"]},
            execution_path=["classifier", "agent_ventas"],
            specialist_outputs=[{"node_id": "agent_ventas", "content": "r1"}],
        )
        assert make_router()(state) == "synthesize"

    def test_all_targets_in_path_without_outputs_ends(self):
        state = initial_state(
            variables={"intent": ["ventas"]},
            execution_path=["classifier", "agent_ventas"],
        )
        from langgraph.graph import END
        assert make_router()(state) == END

    def test_pending_empty_with_unsynthesized_outputs_goes_to_synthesizer(self):
        state = initial_state(
            variables={"intent": ["ventas"]},
            execution_path=["classifier", "agent_ventas"],
            specialist_outputs=[{"node_id": "agent_ventas", "content": "r1"}],
        )
        assert make_router()(state) == "synthesize"

    def test_invalid_intents_fall_back(self):
        assert make_router()(initial_state(variables={"intent": ["nada"]})) == "classifier"

    def test_max_reroutes_lock_still_works(self):
        state = initial_state(variables={"intent": ["ventas"], "reroute_count": 3})
        assert make_router()(state) == "lock_routing"


# ── Grafo end-to-end: fan-out + synthesizer ─────────────────────────────────────

PARALLEL_GRAPH = {
    "type": "pipeline",
    "persist_variables": ["intent", "handoff_done"],
    "nodes": [
        {"id": "check_route", "type": "condition", "config": {
            "mode": "router",
            "route_variable": "variables.intent",
            "routes": {"ventas": "agent_ventas", "soporte": "agent_soporte"},
            "fallback": "classifier",
            "max_reroutes": 3,
            "max_parallel_agents": 3,
            "synthesizer_node": "synthesize",
        }},
        {"id": "classifier", "type": "agent", "agent": "classifier",
         "output_variable": "intent", "classification_pattern": MULTI_PATTERN},
        {"id": "agent_ventas", "type": "agent", "agent": "ventas",
         "output_variable": "intent", "classification_pattern": MULTI_PATTERN},
        {"id": "agent_soporte", "type": "agent", "agent": "soporte",
         "output_variable": "intent", "classification_pattern": MULTI_PATTERN},
        {"id": "synthesize", "type": "synthesizer", "agent": "synthesizer", "config": {}},
    ],
    "edges": [
        {"from": "START", "to": "check_route"},
        {"from": "classifier", "to": "check_route"},
        {"from": "agent_ventas", "to": "check_route"},
        {"from": "agent_soporte", "to": "check_route"},
        {"from": "synthesize", "to": "END"},
    ],
}

PARALLEL_AGENTS = {
    "classifier": {"system_prompt": "clasifica", "model": "gpt-4o"},
    "ventas": {"system_prompt": "ventas", "model": "gpt-4o"},
    "soporte": {"system_prompt": "soporte", "model": "gpt-4o"},
    "synthesizer": {"system_prompt": "combina", "model": "gpt-4o"},
}


def build_parallel_graph(llms):
    """Compila el grafo paralelo con un LLM falso por agente (dict agent_name → fake)."""
    ctx = make_ctx(graph_config=PARALLEL_GRAPH, agents_config=PARALLEL_AGENTS)

    def fake_get_llm(_ctx, agent_name):
        return llms[agent_name]

    with patch("tools.registry.get_llm", side_effect=fake_get_llm):
        graph = create_pipeline_agent(ctx)
    return graph


class TestParallelEndToEnd:

    def _llms(self):
        return {
            "classifier": FakeLLM("[ROUTE:ventas,soporte]"),
            "ventas": FakeLLM("Respuesta de ventas."),
            "soporte": FakeLLM("Respuesta de soporte."),
            "synthesizer": FakeLLM("SÍNTESIS COMBINADA."),
        }

    def test_fanout_produces_single_final_message(self):
        graph = build_parallel_graph(self._llms())
        result = graph.invoke(initial_state("precio y ayuda"))

        # Ambos especialistas y el synthesizer corrieron
        assert "agent_ventas" in result["execution_path"]
        assert "agent_soporte" in result["execution_path"]
        assert "synthesize" in result["execution_path"]

        # 2 outputs acumulados sin conflicto de canales
        assert len(result["specialist_outputs"]) == 2

        # UNA sola burbuja final (la del synthesizer); ni los especialistas ni el
        # classifier (tag-only → contenido vacío) escribieron AIMessages al historial
        ai_messages = [m for m in result["messages"] if m.type == "ai"]
        assert len(ai_messages) == 1
        assert result["messages"][-1].content == "SÍNTESIS COMBINADA."

    def test_specialists_do_not_write_messages_in_parallel(self):
        graph = build_parallel_graph(self._llms())
        result = graph.invoke(initial_state("precio y ayuda"))
        contents = [m.content for m in result["messages"]]
        assert "Respuesta de ventas." not in contents
        assert "Respuesta de soporte." not in contents

    def test_parallel_llm_calls_carry_no_stream_tag(self):
        llms = self._llms()
        graph = build_parallel_graph(llms)
        graph.invoke(initial_state("precio y ayuda"))

        # Especialistas en paralelo: tag presente
        for name in ("ventas", "soporte"):
            assert llms[name].invoke_configs == [{"tags": [NO_STREAM_TAG]}]
        # Clasificador (modo normal) y synthesizer: sin tag
        assert llms["classifier"].invoke_configs == [None]
        assert llms["synthesizer"].invoke_configs == [None]

    def test_synthesizer_reset_clears_intent_for_next_turn(self):
        # Con set_variables {"intent": []} en el synthesize, el turno multi-tema
        # termina con intent vacío: el siguiente mensaje cae al fallback (general)
        # en vez de re-disparar el fan-out completo.
        import json as _json
        graph_cfg = _json.loads(_json.dumps(PARALLEL_GRAPH))
        synth = next(n for n in graph_cfg["nodes"] if n["id"] == "synthesize")
        synth["config"] = {"set_variables": {"intent": []}}

        ctx = make_ctx(graph_config=graph_cfg, agents_config=PARALLEL_AGENTS)
        llms = self._llms()
        with patch("tools.registry.get_llm",
                   side_effect=lambda _c, n: llms[n]):
            graph = create_pipeline_agent(ctx)
        result = graph.invoke(initial_state("precio y ayuda"))

        assert "synthesize" in result["execution_path"]
        assert result["variables"]["intent"] == []

    def test_single_intent_bypasses_synthesizer(self):
        llms = self._llms()
        llms["classifier"] = FakeLLM("[ROUTE:ventas]")
        graph = build_parallel_graph(llms)
        result = graph.invoke(initial_state("solo precio"))

        assert "agent_ventas" in result["execution_path"]
        assert "synthesize" not in result["execution_path"]
        assert result["specialist_outputs"] == []
        assert result["messages"][-1].content == "Respuesta de ventas."
        # Modo single: sin tag de no-stream
        assert llms["ventas"].invoke_configs == [None]


# ── tool_name_matches / disable_tools_if por base_name ──────────────────────────

TOOL_FULL_NAME = "send_bulk_whatsapp_WhatsApp_Outbound"
TOOL_BASE_NAME = "send_bulk_whatsapp"


class TestToolNameMatching:

    def test_matches_full_name_and_base_name(self):
        tool = FakeTool(TOOL_FULL_NAME, base_name=TOOL_BASE_NAME)
        assert tool_name_matches(TOOL_FULL_NAME, tool)
        assert tool_name_matches(TOOL_BASE_NAME, tool)
        assert not tool_name_matches("otra_tool", tool)

    def test_tool_without_metadata_matches_only_full_name(self):
        tool = FakeTool("calculator")
        assert tool_name_matches("calculator", tool)
        assert not tool_name_matches("calc", tool)

    def test_disable_tools_if_matches_base_name(self):
        ctx = make_ctx(agents_config={"a": {"system_prompt": "x", "model": "gpt-4o"}})
        whatsapp = FakeTool(TOOL_FULL_NAME, base_name=TOOL_BASE_NAME)
        other = FakeTool("calculator_Calc", base_name="calculator")
        llm = FakeAgenticLLM([AIMessage(content="listo")])

        with patch("tools.registry.get_llm", return_value=llm), \
             patch("tools.registry.load_tools", return_value=[whatsapp, other]):
            node = make_agent_node(
                "n", "a", None, ctx, max_iterations=2,
                disable_tools_if=[{"tool": TOOL_BASE_NAME, "field": "variables.handoff_done",
                                   "op": "eq", "value": True}],
            )
        node(initial_state(variables={"handoff_done": True}))
        # La regla (por nombre base) deshabilitó SOLO la tool de whatsapp renombrada:
        # el re-bind de runtime dejó únicamente la otra tool
        assert llm.bind_history[-1] == ["calculator_Calc"]


class TestRegistryBaseName:

    def test_load_tools_sets_base_name_metadata(self):
        from tools import registry

        class BareTool:
            def __init__(self):
                self.name = "send_bulk_whatsapp"
                self.description = "desc"
                self.metadata = None

        ctx = make_ctx()
        ctx.agent_tool_instances = {"default": {"uuid-1": {
            "tool_name": "send_bulk_whatsapp",
            "display_name": "WhatsApp Outbound",
            "config": {},
            "credentials": {},
            "enabled_functions": [],
        }}}

        with patch.object(registry, "load_specific_tool", return_value=[BareTool()]):
            tools = registry.load_tools(ctx, "default")

        assert tools[0].name == "send_bulk_whatsapp_WhatsApp_Outbound"
        assert tools[0].metadata["base_name"] == "send_bulk_whatsapp"


# ── Synthesizer unit ─────────────────────────────────────────────────────────────

class TestSynthesizerNode:

    def test_passthrough_single_output_without_llm(self):
        ctx = make_ctx(agents_config=PARALLEL_AGENTS)
        llm = FakeLLM("no debería llamarse")
        with patch("tools.registry.get_llm", return_value=llm):
            node = make_synthesizer_node("synth", "synthesizer", {}, ctx)

        upd = node(initial_state(specialist_outputs=[
            {"node_id": "agent_ventas", "agent": "ventas", "content": "única respuesta"}
        ]))
        assert upd["messages"][0].content == "única respuesta"
        assert llm.invoke_configs == []  # sin llamada LLM

    def test_no_outputs_is_noop(self):
        ctx = make_ctx(agents_config=PARALLEL_AGENTS)
        with patch("tools.registry.get_llm", return_value=FakeLLM("x")):
            node = make_synthesizer_node("synth", "synthesizer", {}, ctx)
        upd = node(initial_state())
        assert "messages" not in upd

    def test_set_variables_applied_after_synthesis(self):
        ctx = make_ctx(agents_config=PARALLEL_AGENTS)
        with patch("tools.registry.get_llm", return_value=FakeLLM("combinada")):
            node = make_synthesizer_node(
                "synth", "synthesizer", {"set_variables": {"intent": []}}, ctx
            )
        upd = node(initial_state(specialist_outputs=[
            {"content": "r1", "agent": "a"}, {"content": "r2", "agent": "b"},
        ]))
        assert upd["variables"] == {"intent": []}

    def test_set_variables_not_applied_without_outputs(self):
        # Sin outputs no hubo síntesis: el reset de ruteo no debe aplicarse
        ctx = make_ctx(agents_config=PARALLEL_AGENTS)
        with patch("tools.registry.get_llm", return_value=FakeLLM("x")):
            node = make_synthesizer_node(
                "synth", "synthesizer", {"set_variables": {"intent": []}}, ctx
            )
        upd = node(initial_state())
        assert "variables" not in upd

    def test_llm_error_falls_back_to_concatenation(self):
        ctx = make_ctx(agents_config=PARALLEL_AGENTS)

        class BrokenLLM:
            def invoke(self, messages, config=None):
                raise RuntimeError("boom")

        with patch("tools.registry.get_llm", return_value=BrokenLLM()):
            node = make_synthesizer_node("synth", "synthesizer", {}, ctx)
        upd = node(initial_state(specialist_outputs=[
            {"content": "r1", "agent": "a"}, {"content": "r2", "agent": "b"},
        ]))
        assert upd["messages"][0].content == "r1\n\nr2"
