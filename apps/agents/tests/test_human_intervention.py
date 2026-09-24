"""
Tests para tools/human_intervention.py — la tool determinista de HITL.

A diferencia de `request_human_handoff` (test_human_handoff.py), esta se invoca desde un nodo
`tool` del graph, no desde el LLM: lo que importa verificar es que sin `api_base`/`access_token`
no ofrezca una tool rota, que llame al endpoint correcto con el token bearer, y que no reviente
ante errores HTTP o de red.
"""

import sys
from pathlib import Path
from unittest.mock import Mock, patch

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

import httpx  # noqa: E402
from tools.human_intervention import load_human_intervention_tools  # noqa: E402

CONFIG = {"api_base": "https://gateway.test"}
CREDENTIALS = {"access_token": "token-123"}


def fake_response(status_code=200):
    response = Mock()
    response.status_code = status_code
    response.raise_for_status = Mock()
    if status_code >= 400:
        response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "error", request=Mock(), response=response
        )
    return response


def test_sin_api_base_no_ofrece_la_tool():
    tools = load_human_intervention_tools(CREDENTIALS, {})
    assert tools == []


def test_sin_access_token_no_ofrece_la_tool():
    tools = load_human_intervention_tools({}, CONFIG)
    assert tools == []


def test_llama_al_endpoint_correcto_con_el_token():
    tools = load_human_intervention_tools(CREDENTIALS, CONFIG)
    assert len(tools) == 1

    with patch(
        "tools.human_intervention.httpx.post", return_value=fake_response()
    ) as post:
        result = tools[0].invoke({"reason": "Número foráneo detectado"})

    post.assert_called_once_with(
        "https://gateway.test/internal/conversations/intervention",
        json={"reason": "Número foráneo detectado"},
        headers={"Authorization": "Bearer token-123"},
        timeout=15.0,
    )
    assert "activada" in result


def test_error_http_no_revienta():
    tools = load_human_intervention_tools(CREDENTIALS, CONFIG)

    with patch(
        "tools.human_intervention.httpx.post", return_value=fake_response(status_code=401)
    ):
        result = tools[0].invoke({"reason": "test"})

    assert "401" in result


def test_error_de_red_no_revienta():
    tools = load_human_intervention_tools(CREDENTIALS, CONFIG)

    with patch(
        "tools.human_intervention.httpx.post",
        side_effect=httpx.ConnectError("no se pudo conectar"),
    ):
        result = tools[0].invoke({"reason": "test"})

    assert "red" in result
