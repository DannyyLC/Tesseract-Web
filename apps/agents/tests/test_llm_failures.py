"""
Fallas del LLM: parámetros, fallbacks y errores visibles.

Origen: al pasar el router de RGM a gpt-6-luna con `reasoning_effort: "none"`, LiteLLM
bloqueó el parámetro (no conocía el modelo) y el nodo convirtió la excepción en su
respuesta: la ejecución salió COMPLETED con 0 tokens y el router ruteó con el texto del
error. Además, los `fallbacks` del config nunca se usaron: ChatLiteLLM los descartaba.

Lo que se fija aquí:
- el motor manda `model_params` con `allowed_openai_params` (no depende de que LiteLLM
  conozca el modelo);
- los fallbacks se construyen con los mismos parámetros y entran si el principal falla;
- sin fallback que responda, el nodo lanza LLMCallError y el servicer lo traduce a
  FAILED_PRECONDITION / evento de error con prefijo LLM_CALL_FAILED.
"""

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

import grpc  # noqa: E402
import pytest  # noqa: E402
from langchain_core.language_models.fake_chat_models import FakeListChatModel  # noqa: E402
from langchain_core.messages import HumanMessage  # noqa: E402
from langchain_core.runnables.fallbacks import RunnableWithFallbacks  # noqa: E402

from core.context import TenantContext  # noqa: E402
from core.llm_errors import LLM_CALL_FAILED, LLMCallError  # noqa: E402
from graphs.pipeline import make_agent_node, make_synthesizer_node  # noqa: E402
from tools import registry  # noqa: E402


class BrokenChatModel(FakeListChatModel):
    """Modelo que siempre falla, como LiteLLM con un parámetro que no reconoce."""

    def _call(self, *args, **kwargs):
        raise RuntimeError("UnsupportedParamsError: openai does not support parameters: ['reasoning_effort']")


def make_ctx(agents_config) -> TenantContext:
    return TenantContext(
        tenant_id="t",
        workflow_id="wf",
        conversation_id="c",
        user_type="internal",
        user_id="u",
        channel="dashboard",
        timezone="UTC",
        agents_config=agents_config,
        graph_config={},
    )


def state(**extra):
    return {"messages": [HumanMessage(content="hola")], "variables": {}, "execution_path": [], **extra}


# ── registry: parámetros ───────────────────────────────────────────────────────

class TestModelParams:

    @patch("langchain_community.chat_models.ChatLiteLLM")
    def test_model_params_travel_with_allowed_openai_params(self, chat_cls):
        ctx = make_ctx({"default": {"model": "gpt-6-luna", "model_params": {"reasoning_effort": "none"}}})

        registry.get_llm(ctx, "default")

        kwargs = chat_cls.call_args[1]
        assert kwargs["model_kwargs"] == {
            "reasoning_effort": "none",
            "allowed_openai_params": ["reasoning_effort"],
        }

    @patch("langchain_community.chat_models.ChatLiteLLM")
    def test_without_model_params_nothing_extra_is_sent(self, chat_cls):
        ctx = make_ctx({"default": {"model": "gpt-6-luna"}})

        registry.get_llm(ctx, "default")

        kwargs = chat_cls.call_args[1]
        assert "model_kwargs" not in kwargs
        # Sin temperature en el config no se manda: el proveedor usa su default.
        assert "temperature" not in kwargs

    @patch("langchain_community.chat_models.ChatLiteLLM")
    def test_fallbacks_are_not_passed_to_the_constructor(self, chat_cls):
        # ChatLiteLLM no tiene campo `fallbacks` y lo descartaba en silencio.
        ctx = make_ctx({"default": {"model": "gpt-6-luna", "fallbacks": ["claude-haiku-5-5"]}})

        registry.get_llm(ctx, "default")

        assert "fallbacks" not in chat_cls.call_args[1]


# ── registry: fallbacks ────────────────────────────────────────────────────────

class TestFallbackChain:

    @patch("langchain_community.chat_models.ChatLiteLLM")
    def test_each_fallback_is_built_with_the_agent_params(self, chat_cls):
        ctx = make_ctx({"default": {
            "model": "gpt-6-luna",
            "temperature": 1,
            "model_params": {"reasoning_effort": "none"},
            "fallbacks": ["gpt-5.6-luna", "gpt-6.1-sol"],
        }})

        registry.get_fallback_llms(ctx, "default")

        built = [c[1] for c in chat_cls.call_args_list]
        assert [k["model"] for k in built] == ["gpt-5.6-luna", "gpt-6.1-sol"]
        for k in built:
            assert k["temperature"] == 1
            assert k["model_kwargs"]["reasoning_effort"] == "none"

    def test_without_fallbacks_returns_the_primary_as_is(self):
        ctx = make_ctx({"default": {"model": "gpt-6-luna"}})
        primary = FakeListChatModel(responses=["ok"])

        assert registry.chain_fallbacks(ctx, "default", primary) is primary

    def test_with_fallbacks_returns_a_fallback_runnable(self):
        ctx = make_ctx({"default": {"model": "gpt-6-luna", "fallbacks": ["gpt-5.6-luna"]}})
        with patch.object(registry, "_build_chat_model", return_value=FakeListChatModel(responses=["fb"])):
            runnable = registry.chain_fallbacks(ctx, "default", BrokenChatModel(responses=["x"]))

        assert isinstance(runnable, RunnableWithFallbacks)
        assert runnable.invoke([HumanMessage(content="hola")]).content == "fb"

    def test_tools_are_bound_on_every_link(self):
        ctx = make_ctx({"default": {"model": "gpt-6-luna", "fallbacks": ["gpt-5.6-luna"]}})
        primary, fallback = Mock(), Mock()
        with patch.object(registry, "_build_chat_model", return_value=fallback):
            registry.chain_fallbacks(ctx, "default", primary, tools=["t"])

        primary.bind_tools.assert_called_once_with(["t"])
        fallback.bind_tools.assert_called_once_with(["t"])


# ── nodo agente ────────────────────────────────────────────────────────────────

class TestAgentNodeFailure:

    def test_failure_raises_instead_of_answering_with_the_error(self):
        ctx = make_ctx({"router": {"model": "gpt-6-luna", "system_prompt": "SP"}})
        with patch("tools.registry.get_llm", return_value=BrokenChatModel(responses=["x"])):
            node = make_agent_node("router", "router", "intent", ctx, r"\[ROUTE:(\w+)\]")

        with pytest.raises(LLMCallError) as exc:
            node(state())

        assert str(exc.value).startswith(LLM_CALL_FAILED)
        assert exc.value.node == "router"

    def test_fallback_answers_when_primary_fails(self):
        ctx = make_ctx({"router": {
            "model": "gpt-6-luna", "system_prompt": "SP", "fallbacks": ["gpt-5.6-luna"],
        }})
        with patch("tools.registry.get_llm", return_value=BrokenChatModel(responses=["x"])), \
             patch.object(registry, "_build_chat_model",
                          return_value=FakeListChatModel(responses=["Claro. [ROUTE:ventas]"])):
            node = make_agent_node("router", "router", "intent", ctx, r"\[ROUTE:(\w+)\]")

        upd = node(state())

        assert upd["variables"]["intent"] == ["ventas"]
        assert all("Error en nodo" not in m.content for m in upd.get("messages", []))


class TestSynthesizerFallback:

    def test_fallback_runs_before_degrading_to_concatenation(self):
        ctx = make_ctx({"synthesizer": {
            "model": "gpt-6-luna", "system_prompt": "SP", "fallbacks": ["gpt-5.6-luna"],
        }})
        with patch("tools.registry.get_llm", return_value=BrokenChatModel(responses=["x"])), \
             patch.object(registry, "_build_chat_model",
                          return_value=FakeListChatModel(responses=["síntesis del fallback"])):
            node = make_synthesizer_node("synth", "synthesizer", {}, ctx)

        upd = node(state(specialist_outputs=[
            {"content": "r1", "agent": "a"}, {"content": "r2", "agent": "b"},
        ]))

        assert upd["messages"][0].content == "síntesis del fallback"


# ── servicer ───────────────────────────────────────────────────────────────────

class FakeGrpcContext:
    def __init__(self):
        self.aborted = None

    def invocation_metadata(self):
        return []

    async def abort(self, code, details):
        self.aborted = (code, details)
        raise RuntimeError(f"aborted: {code}")


class RaisingGraph:
    def __init__(self, exc):
        self.exc = exc

    def invoke(self, state):
        raise self.exc


async def _execute(monkeypatch, exc):
    import grpc_servicer
    from agents.v1 import agents_pb2

    monkeypatch.setattr(grpc_servicer, "_proto_to_pydantic_request", lambda req: req)
    monkeypatch.setattr(
        grpc_servicer,
        "validate_request",
        lambda req: SimpleNamespace(message_history=[], user_message="hola", user_metadata={}),
    )
    monkeypatch.setattr(
        grpc_servicer,
        "build_context",
        lambda validated: SimpleNamespace(
            graph_config={"type": "pipeline"}, agents_config={}, get_agent_config=lambda name: {},
        ),
    )
    monkeypatch.setattr(grpc_servicer, "create_agent_graph", lambda ctx: RaisingGraph(exc))

    context = FakeGrpcContext()
    with pytest.raises(RuntimeError, match="aborted"):
        await grpc_servicer.AgentsServicer().Execute(
            agents_pb2.AgentExecutionRequest(conversation_id="conv-1"), context
        )
    return context.aborted


class TestServicerMapping:

    @pytest.mark.asyncio
    async def test_llm_failure_aborts_with_failed_precondition(self, monkeypatch):
        error = LLMCallError("router", "router", RuntimeError("boom"))

        code, details = await _execute(monkeypatch, error)

        assert code == grpc.StatusCode.FAILED_PRECONDITION
        assert details.startswith(LLM_CALL_FAILED)

    @pytest.mark.asyncio
    async def test_wrapped_llm_failure_is_still_recognized(self, monkeypatch):
        # LangGraph puede envolver la excepción del nodo (p.ej. ramas paralelas).
        inner = LLMCallError("ventas", "ventas", RuntimeError("boom"))
        try:
            try:
                raise inner
            except LLMCallError as e:
                raise RuntimeError("branch failed") from e
        except RuntimeError as wrapped:
            outer = wrapped

        code, details = await _execute(monkeypatch, outer)

        assert code == grpc.StatusCode.FAILED_PRECONDITION
        assert details.startswith(LLM_CALL_FAILED)

    @pytest.mark.asyncio
    async def test_other_errors_stay_internal(self, monkeypatch):
        code, _ = await _execute(monkeypatch, ValueError("config rota"))

        assert code == grpc.StatusCode.INTERNAL
