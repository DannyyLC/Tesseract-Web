"""
Equivalencia del workflow MIGRADO (docs/workflow-migration.json) contra los
mismos 8 escenarios golden de test_workflow_equivalence.py.

El workflow migrado usa SOLO primitivas generales (signal tool + condition +
agente resumidor silent + nodo tool determinista + variable_reducers) y debe
producir los mismos resultados observables que el original:

- misma respuesta única al usuario en cada modo
- UNA sola notificación al equipo por conversación, con el body posicional que
  recibe YCloud idéntico: [client_number, motivo, resumen]. (En el original el
  client_number lo insertaba un hack dentro de la tool; aquí es explícito en el
  nodo notify_team, por eso las aserciones lo incluyen.)
- mismas variables persistidas (intent/previous_intent/handoff_done/media_url)
"""

import copy
import json
import sys
from pathlib import Path
from unittest.mock import patch

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from langchain_core.messages import AIMessage, HumanMessage  # noqa: E402
from core.context import TenantContext  # noqa: E402
from graphs.pipeline_agent import NO_STREAM_TAG, create_pipeline_agent  # noqa: E402

MIGRATION_FILE = Path(__file__).parent.parent / "docs" / "workflow-migration.json"

TEAM_NUMBER = "+52TEAM"
TEMPLATE_UUID = "tpl-uuid"
CLIENT_NUMBER = "+52111"
TOOL_UUID = "ec0f1bf0-e03f-4475-ba57-599ebad41f0c"
MEDIA_ARMAS = "https://drive.google.com/drive/folders/19SoXBInEmkRjmhv2HjJAP4wD7hqFTVlm"
MEDIA_SIM = "https://drive.google.com/drive/folders/138Yi4GoRAAM46n9zs2clpBtfUhdG5zc9"

SPECIALIST_IDS = [
    "armas_menos_letales", "simuladores_de_manejo", "stands_tiro_real",
    "stands_tiro_virtual", "blindaje_automotriz", "equipamiento_de_armerias",
]


def load_workflow():
    raw = MIGRATION_FILE.read_text(encoding="utf-8")
    raw = raw.replace("<<NUMERO_EQUIPO_VENTAS>>", TEAM_NUMBER)
    raw = raw.replace("<<TEMPLATE_UUID>>", TEMPLATE_UUID)
    return json.loads(raw)


# ── Fakes ───────────────────────────────────────────────────────────────────────

class FakeSendBulkTool:
    """Tool falsa de send_bulk_whatsapp para el nodo notify_team."""

    name = "send_bulk_whatsapp"
    description = "fake"
    metadata = {}

    def __init__(self):
        self.calls = []

    def __deepcopy__(self, memo):
        # _make_tool_node deepcopy-a las tools cargadas; conservar la instancia
        # para poder asertar las invocaciones desde el test
        return self

    def invoke(self, args):
        self.calls.append(copy.deepcopy(args))
        return {"total": 1, "sent": 1}


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
        return AIMessage(content=self._content)


class FakeAgenticLLM:
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


def signal_call():
    return AIMessage(content="", tool_calls=[
        {"name": "solicitar_asesor", "args": {}, "id": "sig1", "type": "tool_call"}
    ])


# ── Builder ─────────────────────────────────────────────────────────────────────

def run(llms, tool, message="hola", variables=None):
    workflow = load_workflow()
    ctx = TenantContext(
        tenant_id="t", workflow_id="wf", conversation_id="c",
        user_type="external", user_id=CLIENT_NUMBER, channel="whatsapp",
        timezone="UTC",
        graph_config=workflow["graph"],
        agents_config=workflow["agents"],
        agent_tool_instances={
            "synthesizer": {TOOL_UUID: {
                "tool_name": "send_bulk_whatsapp",
                "display_name": "WhatsApp Outbound",
                "credentials": {},
                "config": {},
                "enabled_functions": [],
            }},
        },
        user_metadata={"client_number": CLIENT_NUMBER},
    )

    patches = [
        patch("graphs.pipeline_agent.get_llm", side_effect=lambda _c, name: llms[name]),
        # Solo el loader de la instancia real (nodo notify_team); las signal
        # tools se cargan por el registry REAL desde agents_config
        patch("graphs.pipeline_agent.load_specific_tool", return_value=[tool]),
    ]
    for p in patches:
        p.start()
    try:
        graph = create_pipeline_agent(ctx)
        return graph.invoke({
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
        })
    finally:
        for p in patches:
            p.stop()


def default_llms(**overrides):
    llms = {
        "general": FakeAgenticLLM([AIMessage(content="[ROUTE:armas_menos_letales]")]),
        "synthesizer": FakeLLM("SÍNTESIS GOLDEN."),
        "handoff_summarizer": FakeLLM("RESUMEN GOLDEN"),
        **{
            name: FakeAgenticLLM([AIMessage(content=f"Respuesta {name}.")])
            for name in SPECIALIST_IDS
        },
    }
    llms.update(overrides)
    return llms


def ai_messages(result):
    return [m for m in result["messages"] if m.type == "ai" and m.content]


EXPECTED_BODY_PREFIX = [CLIENT_NUMBER]


# ── Escenario 1: clasificación inicial → especialista single ────────────────────

class TestScenario1SingleIntent:

    def test_general_classifies_and_specialist_answers(self):
        tool = FakeSendBulkTool()
        result = run(default_llms(), tool)

        assert "inject_context" in result["execution_path"]
        assert "agent_general" in result["execution_path"]
        assert "armas_menos_letales" in result["execution_path"]

        msgs = ai_messages(result)
        assert len(msgs) == 1
        assert msgs[0].content == "Respuesta armas_menos_letales."

        assert result["variables"]["intent"] == ["armas_menos_letales"]
        assert tool.calls == []
        # Sin handoff, la cadena post-turno cae directa a synthesize (no-op)
        assert "check_handoff" in result["execution_path"]
        assert "notify_team" not in result["execution_path"]


# ── Escenario 2: multi-intent → fan-out → síntesis única ────────────────────────

class TestScenario2MultiIntentFanout:

    def _llms(self):
        return default_llms(
            general=FakeAgenticLLM(
                [AIMessage(content="[ROUTE:armas_menos_letales,blindaje_automotriz]")]
            ),
        )

    def test_single_synthesized_reply(self):
        result = run(self._llms(), FakeSendBulkTool())

        assert "armas_menos_letales" in result["execution_path"]
        assert "blindaje_automotriz" in result["execution_path"]
        assert "synthesize" in result["execution_path"]
        assert len(result["specialist_outputs"]) == 2

        msgs = ai_messages(result)
        assert len(msgs) == 1
        assert msgs[0].content == "SÍNTESIS GOLDEN."

    def test_specialist_texts_never_reach_history(self):
        result = run(self._llms(), FakeSendBulkTool())
        contents = [m.content for m in result["messages"]]
        assert "Respuesta armas_menos_letales." not in contents
        assert "Respuesta blindaje_automotriz." not in contents

    def test_parallel_specialists_tagged_no_stream(self):
        llms = self._llms()
        run(llms, FakeSendBulkTool())
        for name in ("armas_menos_letales", "blindaje_automotriz"):
            assert llms[name].invoke_configs == [{"tags": [NO_STREAM_TAG]}]


# ── Escenario 3: handoff en modo single ─────────────────────────────────────────

class TestScenario3SingleHandoff:

    def test_one_deterministic_notification(self):
        tool = FakeSendBulkTool()
        llms = default_llms(
            armas_menos_letales=FakeAgenticLLM([
                signal_call(),
                AIMessage(content="Ya notifiqué al equipo."),
            ]),
        )
        result = run(llms, tool, variables={"intent": ["armas_menos_letales"]})

        # UNA llamada, body posicional [client_number, motivo, resumen] — el
        # mismo payload que YCloud recibía con el motor original
        assert len(tool.calls) == 1
        msg = tool.calls[0]["messages"][0]
        assert msg["to"] == TEAM_NUMBER
        assert msg["template_id"] == TEMPLATE_UUID
        assert msg["variables"]["body"] == [
            CLIENT_NUMBER, "Armas menos letales", "RESUMEN GOLDEN",
        ]

        assert result["variables"]["handoff_done"] is True
        assert result["variables"]["media_url"] == MEDIA_ARMAS
        assert ai_messages(result)[-1].content == "Ya notifiqué al equipo."

    def test_summarizer_is_silent(self):
        llms = default_llms(
            armas_menos_letales=FakeAgenticLLM([
                signal_call(),
                AIMessage(content="Listo."),
            ]),
        )
        result = run(llms, FakeSendBulkTool(),
                     variables={"intent": ["armas_menos_letales"]})
        assert llms["handoff_summarizer"].invoke_configs == [{"tags": [NO_STREAM_TAG]}]
        # El resumen nunca aparece como mensaje al usuario
        assert all("RESUMEN GOLDEN" not in m.content for m in ai_messages(result))


# ── Escenario 4: handoff consolidado en fan-out ─────────────────────────────────

class TestScenario4ConsolidatedHandoff:

    def _run(self, tool):
        llms = default_llms(
            general=FakeAgenticLLM(
                [AIMessage(content="[ROUTE:armas_menos_letales,blindaje_automotriz]")]
            ),
            armas_menos_letales=FakeAgenticLLM([
                signal_call(), AIMessage(content="Armas listo."),
            ]),
            blindaje_automotriz=FakeAgenticLLM([
                signal_call(), AIMessage(content="Blindaje listo."),
            ]),
        )
        return run(llms, tool), llms

    def test_one_call_one_message_with_joined_topics(self):
        tool = FakeSendBulkTool()
        result, _ = self._run(tool)

        # UNA sola invocación con UN mensaje por construcción (nodo determinista)
        assert len(tool.calls) == 1
        msgs = tool.calls[0]["messages"]
        assert len(msgs) == 1
        assert msgs[0]["to"] == TEAM_NUMBER
        assert msgs[0]["variables"]["body"] == [
            CLIENT_NUMBER,
            "Armas menos letales, Blindaje automotriz",
            "RESUMEN GOLDEN",
        ]
        assert result["variables"]["handoff_done"] is True

    def test_synthesizer_receives_handoff_notice(self):
        result, llms = self._run(FakeSendBulkTool())
        assert ai_messages(result)[-1].content == "SÍNTESIS GOLDEN."
        # system_prompt_extra rindió el aviso de que ya se notificó
        assert "notificación consolidada" in llms["synthesizer"].seen_system

    def test_summary_llm_called_exactly_once(self):
        _, llms = self._run(FakeSendBulkTool())
        assert len(llms["handoff_summarizer"].invoke_configs) == 1


# ── Escenario 5: handoff_done deshabilita la señal ──────────────────────────────

class TestScenario5HandoffAlreadyDone:

    def test_signal_unbound_and_no_notification(self):
        tool = FakeSendBulkTool()
        armas = FakeAgenticLLM([AIMessage(content="Sigo atendiéndote.")])
        result = run(
            default_llms(armas_menos_letales=armas),
            tool,
            variables={"intent": ["armas_menos_letales"], "handoff_done": True},
        )

        assert tool.calls == []
        assert "notify_team" not in result["execution_path"]
        # Solo el bind de construcción (con la señal); el re-bind de runtime
        # la deshabilitó y no quedó ninguna tool activa
        assert armas.bind_history == [["solicitar_asesor"]]
        assert ai_messages(result)[-1].content == "Sigo atendiéndote."


# ── Escenario 6: anti-loop → lock_routing ───────────────────────────────────────

class TestScenario6RerouteLock:

    def test_lock_forces_direct_answer(self):
        llms = default_llms(
            general=FakeAgenticLLM([AIMessage(content="Respuesta directa bloqueada.")]),
        )
        result = run(
            llms, FakeSendBulkTool(),
            variables={"intent": ["armas_menos_letales"], "reroute_count": 3},
        )

        assert "lock_routing" in result["execution_path"]
        assert "agent_general" in result["execution_path"]
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
                signal_call(), AIMessage(content="Armas listo."),
            ]),
            simuladores_de_manejo=FakeAgenticLLM([
                signal_call(), AIMessage(content="Sim listo."),
            ]),
        )
        result = run(llms, FakeSendBulkTool())
        assert result["variables"]["media_url"] == f"{MEDIA_ARMAS},{MEDIA_SIM}"


# ── Escenario 8: reset de intent al sintetizar / stickiness en single ───────────

class TestScenario8TurnEndVariables:

    def test_parallel_turn_resets_intent_and_copies_previous(self):
        llms = default_llms(
            general=FakeAgenticLLM(
                [AIMessage(content="[ROUTE:armas_menos_letales,blindaje_automotriz]")]
            ),
        )
        result = run(llms, FakeSendBulkTool())
        assert result["variables"]["intent"] == []
        assert result["variables"]["previous_intent"] == [
            "armas_menos_letales", "blindaje_automotriz",
        ]

    def test_single_turn_keeps_intent_sticky(self):
        result = run(
            default_llms(), FakeSendBulkTool(),
            variables={"intent": ["blindaje_automotriz"]},
        )
        # synthesize corre como no-op (0 outputs) → intent persiste
        assert result["variables"]["intent"] == ["blindaje_automotriz"]

    def test_next_turn_reclassifies_with_previous_intent_context(self):
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
            default_llms(general=general), FakeSendBulkTool(),
            variables={"intent": [], "previous_intent": ["armas_menos_letales"]},
        )
        assert "TEMAS VIGENTES DEL TURNO ANTERIOR" in general.seen_system
        assert "armas_menos_letales" in general.seen_system
