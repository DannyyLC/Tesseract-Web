"""
Tests de tools/whatsapp_outbound.py.

Se fija qué sale hacia YCloud (los valores de la plantilla, en el orden en que los manda quien
llama) y cómo se interpreta la respuesta: un 2xx no basta, porque YCloud reporta en `status` un
envío que Meta rechazó.
"""

import json
import sys
from pathlib import Path
from unittest.mock import Mock, patch

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from tools.whatsapp_outbound import load_whatsapp_outbound_tools  # noqa: E402

TEMPLATE_ID = "tpl-1"
CONFIG = {
    "from_number": "+524490000000",
    "api_key": "key-123",
    "available_templates": {
        TEMPLATE_ID: {
            "name": "prospecto_interesado",
            "language": "es_MX",
            "variables": {"body": ["client_number", "tema_interes", "detalles"]},
        }
    },
}
BODY = ["523951420216", "Número foráneo", "Resumen fijo"]


def fake_response(data):
    response = Mock()
    response.raise_for_status = Mock()
    response.json = Mock(return_value=data)
    return response


def send(ycloud_data):
    tool = load_whatsapp_outbound_tools({}, CONFIG)[0]
    with patch("tools.whatsapp_outbound.httpx.post", return_value=fake_response(ycloud_data)) as post:
        result = json.loads(
            tool.invoke(
                {"messages": [{"to": "+524490000001", "template_id": TEMPLATE_ID, "variables": {"body": BODY}}]}
            )
        )
    return result, post


def test_manda_los_valores_tal_cual_los_da_quien_llama():
    _, post = send({"id": "msg-1", "status": "accepted"})

    payload = post.call_args.kwargs["json"]
    body = next(c for c in payload["template"]["components"] if c["type"] == "body")
    assert [p["text"] for p in body["parameters"]] == BODY


def test_aceptado_por_ycloud_cuenta_como_enviado():
    result, _ = send({"id": "msg-1", "status": "accepted"})

    assert result["sent"] == 1
    assert result["results"][0]["message_id"] == "msg-1"


def test_status_failed_cuenta_como_fallido_con_su_error():
    result, _ = send({"id": "msg-1", "status": "failed", "errorCode": "131026", "errorMessage": "Undeliverable"})

    assert result["sent"] == 0
    assert result["failed"] == 1
    assert "131026" in result["results"][0]["error"]
