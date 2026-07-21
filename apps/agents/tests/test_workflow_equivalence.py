"""
Tests de caracterización del workflow real en producción (bot de ventas WhatsApp
multi-especialista). Capturan el comportamiento OBSERVABLE de punta a punta con el
graph_config real (prompts dummy), y son el contrato de equivalencia para el
refactor del motor: deben pasar idénticos antes y después de cada fase, y también
contra el workflow migrado a las primitivas nuevas.

Escenarios golden:
    1. Sin intent → general clasifica [ROUTE:x] → especialista single responde.
    2. Multi-intent → fan-out → una sola respuesta sintetizada.
    3. Handoff en single → 1 invocación a send_bulk con body [tema, resumen].
    4. Handoff de 2 especialistas al mismo destinatario → 1 llamada consolidada.
    5. handoff_done persistido → tool deshabilitada, 0 notificaciones.
    6. 3 re-ruteos → lock_routing → respuesta directa.
    7. media_url desde 2 ramas → join con coma.
    8. Fin de turno paralelo resetea intent (previous_intent copiado); en single
       el intent persiste (stickiness).
"""

import sys
from pathlib import Path
from unittest.mock import patch

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from langchain_core.messages import AIMessage, HumanMessage  # noqa: E402
from core.context import TenantContext  # noqa: E402
from graphs.pipeline_agent import create_pipeline_agent  # noqa: E402


# ── Constantes del workflow real ────────────────────────────────────────────────

ROUTE_PATTERN = "\\[ROUTE:([\\w,\\s]+)\\]"
TOOL_BASE = "send_bulk_whatsapp"
TOOL_FULL = "send_bulk_whatsapp_WhatsApp_Outbound"
MEDIA_ARMAS = "https://drive.google.com/drive/folders/19SoXBInEmkRjmhv2HjJAP4wD7hqFTVlm"
MEDIA_SIM = "https://drive.google.com/drive/folders/138Yi4GoRAAM46n9zs2clpBtfUhdG5zc9"

SPECIALISTS = {
    "armas_menos_letales": {"label": "Armas menos letales", "media": MEDIA_ARMAS},
    "simuladores_de_manejo": {"label": "Simuladores de manejo", "media": MEDIA_SIM},
    "stands_tiro_real": {"label": "Stands de tiro real", "media": None},
    "stands_tiro_virtual": {"label": "Stands de tiro virtual", "media": None},
    "blindaje_automotriz": {"label": "Blindaje automotriz", "media": None},
    "equipamiento_de_armerias": {"label": "Equipamiento de armerías", "media": None},
}


def _specialist_node(node_id):
    spec = SPECIALISTS[node_id]
    sv = {"handoff_done": True}
    if spec["media"]:
        sv["media_url"] = spec["media"]
    return {
        "id": node_id,
        "type": "agent",
        "agent": node_id,
        "max_iterations": 3,
        "output_variable": "intent",
        "classification_pattern": ROUTE_PATTERN,
        "intercept_tools_in_parallel": [TOOL_BASE],
        "disable_tools_if": [
            {"tool": TOOL_BASE, "field": "variables.handoff_done", "op": "eq", "value": True}
        ],
        "set_variables_on_tool_call": {TOOL_BASE: sv},
        "handoff_label": spec["label"],
    }


def workflow_graph_config():
    """graph_config real del workflow en producción (verbatim, prompts aparte)."""
    return {
        "type": "pipeline",
        "edges": [
            {"from": "START", "to": "check_route"},
            {"from": "inject_context", "to": "agent_general"},
            {"from": "lock_routing", "to": "agent_general"},
            {"from": "agent_general", "to": "check_route"},
            {"from": "armas_menos_letales", "to": "check_route"},
            {"from": "simuladores_de_manejo", "to": "check_route"},
            {"from": "stands_tiro_real", "to": "check_route"},
            {"from": "stands_tiro_virtual", "to": "check_route"},
            {"from": "blindaje_automotriz", "to": "check_route"},
            {"from": "equipamiento_de_armerias", "to": "check_route"},
            {"from": "synthesize", "to": "END"},
        ],
        "nodes": [
            {
                "id": "check_route",
                "type": "condition",
                "config": {
                    "mode": "router",
                    "routes": {
                        "general": "inject_context",
                        "stands_tiro_real": "stands_tiro_real",
                        "stand_de_tiro_real": "stands_tiro_real",
                        "stand_tiro_real": "stands_tiro_real",
                        "stands_tiro_virtual": "stands_tiro_virtual",
                        "stand_de_tiro_virtual": "stands_tiro_virtual",
                        "stand_tiro_virtual": "stands_tiro_virtual",
                        "armas_menos_letales": "armas_menos_letales",
                        "blindaje_automotriz": "blindaje_automotriz",
                        "simuladores_de_manejo": "simuladores_de_manejo",
                        "equipamiento_de_armerias": "equipamiento_de_armerias",
                    },
                    "fallback": "inject_context",
                    "max_reroutes": 3,
                    "route_variable": "variables.intent",
                    "lock_node": "lock_routing",
                    "max_parallel_agents": 7,
                    "synthesizer_node": "synthesize",
                },
            },
            {
                "id": "inject_context",
                "type": "set_variables",
                "config": {
                    "append_system_message": (
                        "TEMAS VIGENTES DEL TURNO ANTERIOR: {{variables.previous_intent}}. "
                        "Reevalúa cuáles siguen vigentes."
                    ),
                },
            },
            {
                "id": "lock_routing",
                "type": "set_variables",
                "config": {
                    "variables": {"routing_locked": True},
                    "append_system_message": "RUTEO BLOQUEADO: responde directo, sin [ROUTE:x].",
                },
            },
            {
                "id": "agent_general",
                "type": "agent",
                "agent": "general",
                "max_iterations": 3,
                "output_variable": "intent",
                "classification_pattern": ROUTE_PATTERN,
                "intercept_tools_in_parallel": [TOOL_BASE],
                "disable_tools_if": [
                    {"tool": TOOL_BASE, "field": "variables.handoff_done", "op": "eq", "value": True}
                ],
                "set_variables_on_tool_call": {TOOL_BASE: {"handoff_done": True}},
            },
            *[_specialist_node(nid) for nid in SPECIALISTS],
            {
                "id": "synthesize",
                "type": "synthesizer",
                "agent": "synthesizer",
                "config": {
                    "execute_pending_handoffs": True,
                    "handoff_notice": "Ya se envió una notificación consolidada al equipo.",
                    "set_variables": {
                        "previous_intent": "{{variables.intent}}",
                        "intent": [],
                    },
                    "join_variables": {"media_url": ","},
                    "consolidate_handoffs": {
                        "list_arg": "messages",
                        "group_by": "to",
                        "merge_field": "variables",
                        "separator": ", ",
                    },
                },
            },
        ],
        "persist_variables": ["intent", "previous_intent", "handoff_done", "media_url"],
        "handoff_reason_injection": {
            "tool": TOOL_BASE,
            "list_arg": "messages",
            "variables_key": "body",
            "label_separator": ", ",
        },
    }


AGENTS_CONFIG = {
    "general": {"model": "gpt-4o", "system_prompt": "PROMPT general"},
    "synthesizer": {"model": "gpt-4o", "system_prompt": "PROMPT synthesizer"},
    **{name: {"model": "gpt-4o", "system_prompt": f"PROMPT {name}"} for name in SPECIALISTS},
}


# ── Fakes ───────────────────────────────────────────────────────────────────────

class FakeTool:
    def __init__(self, name=TOOL_FULL, base_name=TOOL_BASE):
        self.name = name
        self.metadata = {"base_name": base_name}
        self.calls = []

    def invoke(self, args):
        self.calls.append(args)
        return "ok"


class FakeLLM:
    """Single-call: siempre la misma respuesta."""

    def __init__(self, content):
        self._content = content
        self.invoke_configs = []

    def bind_tools(self, tools):
        return self

    def invoke(self, messages, config=None):
        self.invoke_configs.append(config)
        return AIMessage(content=self._content)


class FakeAgenticLLM:
    """Cola de respuestas propia; registra las tools bindeadas en cada re-bind."""

    def __init__(self, responses):
        self._responses = list(responses)
        self.bind_history = []
        self.invoke_configs = []

    def bind_tools(self, tools):
        self.bind_history.append([t.name for t in tools])
        return self

    def invoke(self, messages, config=None):
        self.invoke_configs.append(config)
        if not self._responses:
            return AIMessage(content="(sin respuestas programadas)")
        return self._responses.pop(0)


def tool_call_msg(args):
    return AIMessage(content="", tool_calls=[
        {"name": TOOL_FULL, "args": args, "id": "call_1", "type": "tool_call"}
    ])


def handoff_call(body=None):
    return tool_call_msg({
        "messages": [{
            "to": "+52TEAM",
            "template_id": "tpl-uuid",
            "variables": {"body": body or ["texto del LLM"]},
        }]
    })


# ── Builder ─────────────────────────────────────────────────────────────────────

def make_ctx():
    return TenantContext(
        tenant_id="t", workflow_id="wf", conversation_id="c",
        user_type="external", user_id="+521234", channel="whatsapp",
        timezone="UTC",
        graph_config=workflow_graph_config(),
        agents_config=AGENTS_CONFIG,
    )


def build(llms, tool, summary="RESUMEN GOLDEN"):
    """Compila el grafo real con fakes y devuelve (graph, patches activos)."""
    ctx = make_ctx()
    patches = [
        patch("graphs.pipeline_agent.get_llm", side_effect=lambda _c, name: llms[name]),
        patch("graphs.pipeline_agent.load_tools", return_value=[tool]),
        patch("graphs.pipeline_agent._summarize_handoff_conversation", return_value=summary),
    ]
    for p in patches:
        p.start()
    graph = create_pipeline_agent(ctx)
    return graph, patches


def run(llms, tool, message="hola", variables=None, summary="RESUMEN GOLDEN"):
    graph, patches = build(llms, tool, summary)
    try:
        return graph.invoke({
            "messages": [HumanMessage(content=message)],
            "variables": variables or {},
            "current_node": "",
            "execution_path": [],
            "iteration_count": 0,
            "specialist_outputs": [],
            "pending_handoffs": [],
            "collected_variables": [],
            "parallel_mode": False,
        })
    finally:
        for p in patches:
            p.stop()


def default_llms(**overrides):
    llms = {
        "general": FakeAgenticLLM([AIMessage(content="[ROUTE:armas_menos_letales]")]),
        "synthesizer": FakeLLM("SÍNTESIS GOLDEN."),
        **{
            name: FakeAgenticLLM([AIMessage(content=f"Respuesta {name}.")])
            for name in SPECIALISTS
        },
    }
    llms.update(overrides)
    return llms


def ai_messages(result):
    return [m for m in result["messages"] if m.type == "ai" and m.content]


# ── Escenario 1: clasificación inicial → especialista single ────────────────────

class TestScenario1SingleIntent:

    def test_general_classifies_and_specialist_answers(self):
        tool = FakeTool()
        result = run(default_llms(), tool)

        assert "inject_context" in result["execution_path"]
        assert "agent_general" in result["execution_path"]
        assert "armas_menos_letales" in result["execution_path"]
        assert "synthesize" not in result["execution_path"]

        # Una sola burbuja al usuario: la del especialista (el tag del general
        # se limpió y su mensaje quedó vacío → no se agrega al historial)
        msgs = ai_messages(result)
        assert len(msgs) == 1
        assert msgs[0].content == "Respuesta armas_menos_letales."

        # El intent queda persistido (stickiness de modo single — escenario 8b)
        assert result["variables"]["intent"] == ["armas_menos_letales"]
        assert tool.calls == []

    def test_specialist_streams_without_no_stream_tag(self):
        llms = default_llms()
        run(llms, FakeTool())
        assert llms["armas_menos_letales"].invoke_configs == [None]


# ── Escenario 2: multi-intent → fan-out → síntesis única ────────────────────────

class TestScenario2MultiIntentFanout:

    def _llms(self):
        return default_llms(
            general=FakeAgenticLLM(
                [AIMessage(content="[ROUTE:armas_menos_letales,blindaje_automotriz]")]
            ),
        )

    def test_single_synthesized_reply(self):
        result = run(self._llms(), FakeTool())

        assert "armas_menos_letales" in result["execution_path"]
        assert "blindaje_automotriz" in result["execution_path"]
        assert "synthesize" in result["execution_path"]
        assert len(result["specialist_outputs"]) == 2

        msgs = ai_messages(result)
        assert len(msgs) == 1
        assert msgs[0].content == "SÍNTESIS GOLDEN."

    def test_specialist_texts_never_reach_history(self):
        result = run(self._llms(), FakeTool())
        contents = [m.content for m in result["messages"]]
        assert "Respuesta armas_menos_letales." not in contents
        assert "Respuesta blindaje_automotriz." not in contents

    def test_parallel_specialists_tagged_no_stream(self):
        llms = self._llms()
        run(llms, FakeTool())
        for name in ("armas_menos_letales", "blindaje_automotriz"):
            assert llms[name].invoke_configs == [{"tags": ["pipeline_no_stream"]}]


# ── Escenario 3: handoff en modo single ─────────────────────────────────────────

class TestScenario3SingleHandoff:

    def test_one_direct_call_with_deterministic_body(self):
        tool = FakeTool()
        llms = default_llms(
            armas_menos_letales=FakeAgenticLLM([
                handoff_call(),
                AIMessage(content="Ya notifiqué al equipo."),
            ]),
        )
        result = run(
            llms, tool, variables={"intent": ["armas_menos_letales"]}
        )

        # UNA llamada directa (sin synthesizer) con motivo/resumen deterministas
        assert len(tool.calls) == 1
        body = tool.calls[0]["messages"][0]["variables"]["body"]
        assert body == ["Armas menos letales", "RESUMEN GOLDEN"]
        assert "synthesize" not in result["execution_path"]

        # set_variables_on_tool_call del nodo armas
        assert result["variables"]["handoff_done"] is True
        assert result["variables"]["media_url"] == MEDIA_ARMAS

        assert ai_messages(result)[-1].content == "Ya notifiqué al equipo."


# ── Escenario 4: handoff consolidado en fan-out ─────────────────────────────────

class TestScenario4ConsolidatedHandoff:

    def _run(self, tool):
        llms = default_llms(
            general=FakeAgenticLLM(
                [AIMessage(content="[ROUTE:armas_menos_letales,blindaje_automotriz]")]
            ),
            armas_menos_letales=FakeAgenticLLM([
                handoff_call(["armas"]),
                AIMessage(content="Armas listo."),
            ]),
            blindaje_automotriz=FakeAgenticLLM([
                handoff_call(["blindaje"]),
                AIMessage(content="Blindaje listo."),
            ]),
        )
        return run(llms, tool)

    def test_one_call_one_message_with_joined_labels(self):
        tool = FakeTool()
        result = self._run(tool)

        # UNA sola invocación real, colapsada a UN mensaje (mismo destinatario)
        assert len(tool.calls) == 1
        msgs = tool.calls[0]["messages"]
        assert len(msgs) == 1
        assert msgs[0]["to"] == "+52TEAM"
        assert msgs[0]["variables"]["body"] == [
            "Armas menos letales, Blindaje automotriz",
            "RESUMEN GOLDEN",
        ]

        # El canal de capturas quedó reseteado y el flag marcado
        assert result["pending_handoffs"] == []
        assert result["variables"]["handoff_done"] is True

    def test_synthesizer_still_produces_single_reply(self):
        result = self._run(FakeTool())
        assert ai_messages(result)[-1].content == "SÍNTESIS GOLDEN."


# ── Escenario 5: handoff_done deshabilita la tool ───────────────────────────────

class TestScenario5HandoffAlreadyDone:

    def test_tool_unbound_and_not_called(self):
        tool = FakeTool()
        armas = FakeAgenticLLM([AIMessage(content="Sigo atendiéndote.")])
        result = run(
            default_llms(armas_menos_letales=armas),
            tool,
            variables={"intent": ["armas_menos_letales"], "handoff_done": True},
        )

        assert tool.calls == []
        # Sin tools activas no hay re-bind de runtime: solo queda el bind de
        # construcción y el nodo invoca el LLM pelón (sin tools disponibles)
        assert armas.bind_history == [[TOOL_FULL]]
        assert ai_messages(result)[-1].content == "Sigo atendiéndote."


# ── Escenario 6: anti-loop → lock_routing ───────────────────────────────────────

class TestScenario6RerouteLock:

    def test_lock_forces_direct_answer(self):
        llms = default_llms(
            general=FakeAgenticLLM([AIMessage(content="Respuesta directa bloqueada.")]),
        )
        result = run(
            llms, FakeTool(),
            variables={"intent": ["armas_menos_letales"], "reroute_count": 3},
        )

        assert "lock_routing" in result["execution_path"]
        assert "agent_general" in result["execution_path"]
        # El especialista NO corre: el lock desvía al general
        assert "armas_menos_letales" not in result["execution_path"]

        assert result["variables"]["routing_locked"] is True
        assert ai_messages(result)[-1].content == "Respuesta directa bloqueada."


# ── Escenario 7: media_url acumulado desde 2 ramas ──────────────────────────────

class TestScenario7MediaUrlJoin:

    def test_join_with_comma_preserving_branch_order(self):
        llms = default_llms(
            general=FakeAgenticLLM(
                [AIMessage(content="[ROUTE:armas_menos_letales,simuladores_de_manejo]")]
            ),
            armas_menos_letales=FakeAgenticLLM([
                handoff_call(["armas"]),
                AIMessage(content="Armas listo."),
            ]),
            simuladores_de_manejo=FakeAgenticLLM([
                handoff_call(["sim"]),
                AIMessage(content="Sim listo."),
            ]),
        )
        result = run(llms, FakeTool())

        assert result["variables"]["media_url"] == f"{MEDIA_ARMAS},{MEDIA_SIM}"


# ── Escenario 8: reset de intent al sintetizar / stickiness en single ───────────

class TestScenario8TurnEndVariables:

    def test_parallel_turn_resets_intent_and_copies_previous(self):
        llms = default_llms(
            general=FakeAgenticLLM(
                [AIMessage(content="[ROUTE:armas_menos_letales,blindaje_automotriz]")]
            ),
        )
        result = run(llms, FakeTool())

        assert result["variables"]["intent"] == []
        assert result["variables"]["previous_intent"] == [
            "armas_menos_letales", "blindaje_automotriz",
        ]

    def test_single_turn_keeps_intent_sticky(self):
        result = run(
            default_llms(), FakeTool(),
            variables={"intent": ["blindaje_automotriz"]},
        )
        # El synthesizer nunca corrió → el intent persiste para el siguiente turno
        assert "synthesize" not in result["execution_path"]
        assert result["variables"]["intent"] == ["blindaje_automotriz"]

    def test_next_turn_reclassifies_with_previous_intent_context(self):
        # Turno siguiente al reset: intent=[] → fallback → inject_context suma los
        # temas previos al system prompt del general
        class RecordingAgenticLLM(FakeAgenticLLM):
            def __init__(self, responses):
                super().__init__(responses)
                self.seen_system = None

            def invoke(self, messages, config=None):
                if messages and messages[0].type == "system":
                    self.seen_system = messages[0].content
                return super().invoke(messages, config)

        general = RecordingAgenticLLM([AIMessage(content="[ROUTE:armas_menos_letales]")])
        run(
            default_llms(general=general), FakeTool(),
            variables={"intent": [], "previous_intent": ["armas_menos_letales"]},
        )
        assert "TEMAS VIGENTES DEL TURNO ANTERIOR" in general.seen_system
        assert "armas_menos_letales" in general.seen_system
