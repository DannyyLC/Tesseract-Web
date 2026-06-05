"""
Tests para el soporte de router conversacional en graphs/pipeline_agent.py.

Cubre:
- classification_pattern en _make_agent_node (extracción de intent, limpieza de tag, lock)
- __append_system_message__ propagado por set_variables y consumido por agent
- modo router en _make_condition_function (ya cubierto por smoke test; aquí integración)
- grafo end-to-end: classify → especialista → END
- filtrado persist_variables del servicer
"""

import sys
from pathlib import Path
from unittest.mock import patch

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from langchain_core.messages import AIMessage, HumanMessage  # noqa: E402
from core.context import TenantContext  # noqa: E402
from graphs.pipeline_agent import (  # noqa: E402
    _make_agent_node,
    _make_set_variables_node,
    create_pipeline_agent,
)


# ── Fakes / helpers ────────────────────────────────────────────────────────────

class FakeLLM:
    """LLM falso: devuelve un AIMessage con contenido scripteado."""

    def __init__(self, content: str):
        self._content = content

    def invoke(self, messages):
        return AIMessage(content=self._content)


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


def run_node(content, *, locked=False, intent_before=None, pattern=r"\[ROUTE:(\w+)\]"):
    """Construye un agent node con classification_pattern y lo ejecuta una vez."""
    ctx = make_ctx()
    with patch("graphs.pipeline_agent.get_llm", return_value=FakeLLM(content)):
        node = _make_agent_node("classifier", "classifier", "intent", ctx, pattern)
    variables = {}
    if intent_before is not None:
        variables["intent"] = intent_before
    if locked:
        variables["routing_locked"] = True
    state = {"messages": [HumanMessage(content="hi")], "variables": variables, "execution_path": []}
    return node(state)


# ── classification_pattern (tabla del doc) ──────────────────────────────────────

class TestClassificationPattern:

    def test_no_tag_keeps_message_and_intent(self):
        upd = run_node("Hola, ¿en qué ayudo?")
        assert "intent" not in upd.get("variables", {})
        assert upd["messages"][0].content == "Hola, ¿en qué ayudo?"

    def test_tag_with_text_extracts_and_cleans(self):
        upd = run_node("Entendido. [ROUTE:ventas]")
        assert upd["variables"]["intent"] == "ventas"
        assert upd["variables"]["reroute_count"] == 1
        assert upd["messages"][0].content == "Entendido."

    def test_tag_only_extracts_and_drops_message(self):
        upd = run_node("[ROUTE:ventas]")
        assert upd["variables"]["intent"] == "ventas"
        assert "messages" not in upd  # mensaje vacío → no se agrega al historial

    def test_locked_ignores_pattern_keeps_tag_and_intent(self):
        upd = run_node("Entendido. [ROUTE:ventas]", locked=True, intent_before="soporte")
        # intent no cambia (sigue soporte), el tag NO se elimina
        assert upd.get("variables", {}).get("intent", "soporte") == "soporte"
        assert upd["messages"][0].content == "Entendido. [ROUTE:ventas]"

    def test_reroute_count_only_increments_on_change(self):
        upd = run_node("[ROUTE:ventas]", intent_before="ventas")
        # mismo intent → no incrementa
        assert "reroute_count" not in upd.get("variables", {})


# ── set_variables + __append_system_message__ ───────────────────────────────────

class TestSetVariablesAndAppend:

    def test_set_variables_sets_and_appends(self):
        ctx = make_ctx()
        node = _make_set_variables_node(
            "lock",
            {"variables": {"routing_locked": True}, "append_system_message": "NO RUTEES"},
            ctx,
        )
        upd = node({"variables": {}, "execution_path": []})
        assert upd["variables"]["routing_locked"] is True
        assert upd["variables"]["__append_system_message__"] == "NO RUTEES"
        assert upd["execution_path"] == ["lock"]

    def test_agent_consumes_append_system_message(self):
        ctx = make_ctx(agents_config={"general": {"system_prompt": "Base", "model": "gpt-4o"}})
        captured = {}

        class CapturingLLM:
            def invoke(self, messages):
                captured["system"] = messages[0].content
                return AIMessage(content="respuesta")

        with patch("graphs.pipeline_agent.get_llm", return_value=CapturingLLM()):
            node = _make_agent_node("general", "general", None, ctx)
        upd = node({
            "messages": [HumanMessage(content="hola")],
            "variables": {"__append_system_message__": "INSTRUCCION EXTRA"},
            "execution_path": [],
        })
        # el append se sumó al system prompt
        assert "INSTRUCCION EXTRA" in captured["system"]
        # y se limpió del estado para no afectar nodos posteriores
        assert "__append_system_message__" not in upd["variables"]


# ── Grafo end-to-end ────────────────────────────────────────────────────────────

ROUTER_GRAPH = {
    "type": "pipeline",
    "persist_variables": ["intent"],
    "nodes": [
        {"id": "check_route", "type": "condition", "config": {
            "mode": "router",
            "route_variable": "variables.intent",
            "routes": {"ventas": "agent_ventas", "general": "agent_general"},
            "fallback": "classifier",
            "max_reroutes": 3,
            "lock_node": "lock_routing",
        }},
        {"id": "lock_routing", "type": "set_variables", "config": {
            "variables": {"routing_locked": True},
            "append_system_message": "RUTEO BLOQUEADO",
        }},
        {"id": "classifier", "type": "agent", "agent": "classifier",
         "output_variable": "intent", "classification_pattern": r"\[ROUTE:(\w+)\]"},
        {"id": "agent_ventas", "type": "agent", "agent": "ventas",
         "output_variable": "intent", "classification_pattern": r"\[ROUTE:(\w+)\]"},
        {"id": "agent_general", "type": "agent", "agent": "general",
         "output_variable": "intent", "classification_pattern": r"\[ROUTE:(\w+)\]"},
    ],
    "edges": [
        {"from": "START", "to": "check_route"},
        {"from": "lock_routing", "to": "agent_general"},
        {"from": "classifier", "to": "check_route"},
        {"from": "agent_ventas", "to": "check_route"},
        {"from": "agent_general", "to": "check_route"},
    ],
}

AGENTS = {
    "classifier": {"system_prompt": "clasifica", "model": "gpt-4o"},
    "ventas": {"system_prompt": "ventas", "model": "gpt-4o"},
    "general": {"system_prompt": "general", "model": "gpt-4o"},
}


def build_router_graph(scripts):
    """Compila el grafo router con un FakeLLM por agente según `scripts`."""
    ctx = make_ctx(graph_config=ROUTER_GRAPH, agents_config=AGENTS)

    def fake_get_llm(_ctx, agent_name):
        return FakeLLM(scripts[agent_name])

    with patch("graphs.pipeline_agent.get_llm", side_effect=fake_get_llm):
        graph = create_pipeline_agent(ctx)
    return graph


class TestRouterGraphEndToEnd:

    def test_classify_then_specialist_answers(self):
        graph = build_router_graph({
            "classifier": "Con gusto. [ROUTE:ventas]",
            "ventas": "El plan premium cuesta $10.",
            "general": "n/a",
        })
        result = graph.invoke({
            "messages": [HumanMessage(content="precios?")],
            "variables": {}, "current_node": "", "execution_path": [], "iteration_count": 0,
        })
        assert result["variables"]["intent"] == "ventas"
        assert "classifier" in result["execution_path"]
        assert "agent_ventas" in result["execution_path"]
        # El último mensaje (lo que ve el usuario) es la respuesta del especialista
        assert result["messages"][-1].content == "El plan premium cuesta $10."

    def test_persisted_intent_skips_classifier(self):
        graph = build_router_graph({
            "classifier": "no deberia correr",
            "ventas": "Respuesta de ventas.",
            "general": "n/a",
        })
        result = graph.invoke({
            "messages": [HumanMessage(content="otra pregunta de ventas")],
            "variables": {"intent": "ventas"},  # intent persistido del mensaje anterior
            "current_node": "", "execution_path": [], "iteration_count": 0,
        })
        assert "classifier" not in result["execution_path"]
        assert "agent_ventas" in result["execution_path"]
        assert result["messages"][-1].content == "Respuesta de ventas."

    def test_anti_loop_activates_lock(self):
        graph = build_router_graph({
            "classifier": "[ROUTE:ventas]",
            "ventas": "[ROUTE:general]",   # ventas re-rutea
            "general": "Respuesta general final.",
        })
        # arrancamos cerca del límite para forzar el lock rápido
        result = graph.invoke({
            "messages": [HumanMessage(content="caso confuso")],
            "variables": {"intent": "ventas", "reroute_count": 3},
            "current_node": "", "execution_path": [], "iteration_count": 0,
        })
        assert "lock_routing" in result["execution_path"]
        assert "agent_general" in result["execution_path"]
        assert result["variables"]["routing_locked"] is True
        assert result["messages"][-1].content == "Respuesta general final."


# ── Filtrado persist_variables (servicer) ───────────────────────────────────────

class TestPersistFilter:

    def test_filters_to_declared_keys_only(self):
        import grpc_servicer
        ctx = make_ctx(graph_config={"persist_variables": ["intent"]})
        out = grpc_servicer._filter_persistent_variables(
            {"intent": "ventas", "reroute_count": 2, "routing_locked": True}, ctx
        )
        assert out == '{"intent": "ventas"}'

    def test_no_persist_variables_returns_empty(self):
        import grpc_servicer
        ctx = make_ctx(graph_config={})
        assert grpc_servicer._filter_persistent_variables({"intent": "x"}, ctx) == "{}"

    def test_custom_keys_are_agnostic(self):
        import grpc_servicer
        ctx = make_ctx(graph_config={"persist_variables": ["customer_tier", "lang"]})
        out = grpc_servicer._filter_persistent_variables(
            {"customer_tier": "gold", "lang": "es", "intent": "x"}, ctx
        )
        import json
        assert json.loads(out) == {"customer_tier": "gold", "lang": "es"}
