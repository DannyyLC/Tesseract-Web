"""
El RPC `Execute` solo regresa las respuestas que generó el turno actual.

Antes regresaba todos los mensajes `assistant` del estado, historial incluido, y el Gateway manda
el último. Cuando un turno terminaba sin respuesta nueva —una rama del graph que no pasa por ningún
agente, como la de "número foráneo" que solo activa HITL y avisa al equipo—, el cliente recibía
repetida la respuesta del turno anterior.

El grafo va simulado: lo que se fija aquí es qué hace el servicer con el estado que el grafo le
devuelve, no el grafo en sí.
"""

import sys
from pathlib import Path
from types import SimpleNamespace

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

import pytest  # noqa: E402
from langchain_core.messages import AIMessage  # noqa: E402

SECRET = "un-secreto-de-prueba"

HISTORY = [
    {"role": "user", "content": "Hola"},
    {"role": "assistant", "content": "Respuesta vieja del turno anterior"},
]


class FakeGrpcContext:
    def __init__(self):
        self.aborted_with = None

    def invocation_metadata(self):
        return [("x-internal-token", SECRET)]

    async def abort(self, code, details):
        self.aborted_with = code
        raise RuntimeError(f"aborted: {code} {details}")


class FakeGraph:
    """Devuelve el estado de entrada más `new_messages`, como hace el reducer add_messages."""

    def __init__(self, new_messages):
        self.new_messages = new_messages

    def invoke(self, state):
        return {"messages": list(state["messages"]) + self.new_messages, "variables": {}}


async def _execute(monkeypatch, new_messages):
    import grpc_servicer
    from agents.v1 import agents_pb2

    monkeypatch.setenv("AGENTS_INTERNAL_SECRET", SECRET)
    monkeypatch.setattr(grpc_servicer, "_proto_to_pydantic_request", lambda req: req)
    monkeypatch.setattr(
        grpc_servicer,
        "validate_request",
        lambda req: SimpleNamespace(message_history=HISTORY, user_message="Hola otra vez", user_metadata={}),
    )
    monkeypatch.setattr(
        grpc_servicer,
        "build_context",
        lambda validated: SimpleNamespace(
            graph_config={"type": "pipeline"},
            agents_config={},
            get_agent_config=lambda name: {},
        ),
    )
    monkeypatch.setattr(grpc_servicer, "create_agent_graph", lambda ctx: FakeGraph(new_messages))

    context = FakeGrpcContext()
    response = await grpc_servicer.AgentsServicer().Execute(
        agents_pb2.AgentExecutionRequest(conversation_id="conv-1"), context
    )
    assert context.aborted_with is None
    return [m.content for m in response.messages]


@pytest.mark.asyncio
async def test_turno_normal_regresa_la_respuesta_nueva(monkeypatch):
    contents = await _execute(monkeypatch, [AIMessage(content="Respuesta nueva")])

    assert contents == ["Respuesta nueva"]


@pytest.mark.asyncio
async def test_turno_sin_respuesta_no_reenvia_la_del_historial(monkeypatch):
    contents = await _execute(monkeypatch, [])

    assert contents == []


@pytest.mark.asyncio
async def test_varias_respuestas_del_turno_conservan_su_orden(monkeypatch):
    # Especialistas + sintetizador: el Gateway manda la última, igual que antes.
    contents = await _execute(
        monkeypatch, [AIMessage(content="Primera"), AIMessage(content="Síntesis final")]
    )

    assert contents == ["Primera", "Síntesis final"]
