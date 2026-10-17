"""
Tests para tools/http_request.py — tool HTTP genérica configurable por workflow.
"""

import json
import socket
import sys
from pathlib import Path
from unittest.mock import patch, Mock

import pytest

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from tools.http_request import load_http_request_tools  # noqa: E402


def make_tool(credentials=None, config=None):
    tools = load_http_request_tools(credentials or {}, config or {})
    assert len(tools) == 1
    return tools[0]


PUBLIC_IP = "93.184.216.34"


def addrinfo(*ips):
    """Lo que devolvería socket.getaddrinfo para esas IPs."""
    return [
        (socket.AF_INET6 if ":" in ip else socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443))
        for ip in ips
    ]


@pytest.fixture(autouse=True)
def public_dns():
    """Por defecto todo nombre resuelve a una IP pública: los tests no tocan DNS real."""
    with patch("tools.http_request.socket.getaddrinfo", return_value=addrinfo(PUBLIC_IP)) as m:
        yield m


def fake_response(status_code=200, text='{"ok": 1}'):
    resp = Mock()
    resp.status_code = status_code
    resp.text = text
    resp.is_success = 200 <= status_code < 300
    return resp


class TestHttpRequestTool:

    def test_absolute_url_get(self):
        tool = make_tool()
        with patch("tools.http_request._send", return_value=fake_response()) as req:
            out = json.loads(tool.invoke({"method": "GET", "url": "https://api.x.com/v1"}))

        assert out == {"ok": True, "status_code": 200, "body": '{"ok": 1}'}
        # Conecta a la IP ya validada, pero le habla (Host y certificado) al nombre original.
        assert req.call_args[0] == ("GET", f"https://{PUBLIC_IP}/v1")
        assert req.call_args[1]["headers"]["Host"] == "api.x.com"
        assert req.call_args[1]["sni_hostname"] == "api.x.com"

    def test_relative_path_joins_base_url(self):
        tool = make_tool(config={"base_url": "https://api.x.com"})
        with patch("tools.http_request._send", return_value=fake_response()) as req:
            tool.invoke({"method": "GET", "url": "/v1/contacts"})
        assert req.call_args[0][1] == f"https://{PUBLIC_IP}/v1/contacts"
        assert req.call_args[1]["headers"]["Host"] == "api.x.com"

    def test_url_outside_base_url_rejected(self):
        tool = make_tool(config={"base_url": "https://api.x.com"})
        out = json.loads(tool.invoke({"method": "GET", "url": "https://evil.com/x"}))
        assert out["ok"] is False
        assert "base_url" in out["error"]

    def test_relative_url_without_base_url_rejected(self):
        tool = make_tool()
        out = json.loads(tool.invoke({"method": "GET", "url": "/v1/x"}))
        assert out["ok"] is False

    def test_method_not_allowed(self):
        tool = make_tool(config={"allowed_methods": ["GET"]})
        out = json.loads(tool.invoke({"method": "DELETE", "url": "https://api.x.com/v1"}))
        assert out["ok"] is False
        assert "no permitido" in out["error"]

    def test_bearer_auth_header_wins_over_model_headers(self):
        tool = make_tool(credentials={"auth_type": "bearer", "token": "SECRET"})
        with patch("tools.http_request._send", return_value=fake_response()) as req:
            tool.invoke({
                "method": "GET",
                "url": "https://api.x.com/v1",
                "headers": {"Authorization": "Bearer fake-del-modelo"},
            })
        assert req.call_args[1]["headers"]["Authorization"] == "Bearer SECRET"

    def test_custom_header_auth(self):
        tool = make_tool(credentials={
            "auth_type": "header", "header_name": "X-API-Key", "token": "K",
        })
        with patch("tools.http_request._send", return_value=fake_response()) as req:
            tool.invoke({"method": "GET", "url": "https://api.x.com/v1"})
        assert req.call_args[1]["headers"]["X-API-Key"] == "K"

    def test_response_truncated_to_max_chars(self):
        tool = make_tool(config={"max_response_chars": 5})
        with patch("tools.http_request._send",
                   return_value=fake_response(text="0123456789")):
            out = json.loads(tool.invoke({"method": "GET", "url": "https://api.x.com/v1"}))
        assert out["body"] == "01234"

    def test_network_error_returns_structured_error(self):
        import httpx as _httpx
        tool = make_tool()
        with patch("tools.http_request._send",
                   side_effect=_httpx.RequestError("timeout")):
            out = json.loads(tool.invoke({"method": "GET", "url": "https://api.x.com/v1"}))
        assert out["ok"] is False
        assert "Network error" in out["error"]

    def test_error_status_reports_not_success(self):
        tool = make_tool()
        with patch("tools.http_request._send",
                   return_value=fake_response(status_code=404, text="nope")):
            out = json.loads(tool.invoke({"method": "GET", "url": "https://api.x.com/v1"}))
        assert out == {"ok": False, "status_code": 404, "body": "nope"}

    def test_registry_loads_http_request(self):
        from tools.registry import load_specific_tool
        from core.context import TenantContext

        ctx = TenantContext(
            tenant_id="t", workflow_id="w", conversation_id="c",
            user_type="internal", user_id="u", channel="dashboard",
        )
        tools = load_specific_tool("http_request", {}, {}, ctx)
        assert [t.name for t in tools] == ["http_request"]


class TestHttpRequestDestinos:
    """
    La petición sale desde dentro de Google Cloud. Cada caso es una forma de pedirle a la tool
    que llegue a algo interno; ninguno debe producir una conexión.
    """

    def _blocked(self, tool, url, **extra):
        with patch("tools.http_request._send") as req:
            out = json.loads(tool.invoke({"method": "GET", "url": url, **extra}))
        assert out["ok"] is False, out
        req.assert_not_called()
        return out

    @pytest.mark.parametrize("ip", [
        "169.254.169.254",   # servidor de metadata de GCP
        "127.0.0.1",
        "10.8.0.3",          # red privada / VPC
        "192.168.1.10",
        "172.16.0.5",
        "100.64.0.1",        # CGNAT
        "0.0.0.0",
        "::1",
        "fe80::1",
        "fd00::1",
        "::ffff:169.254.169.254",  # IPv4 envuelta en IPv6
    ])
    def test_ips_internas_bloqueadas(self, public_dns, ip):
        public_dns.return_value = addrinfo(ip)
        out = self._blocked(make_tool(), "https://cualquier-nombre.com/x")
        assert "no permitido" in out["error"]

    def test_metadata_por_nombre(self, public_dns):
        public_dns.return_value = addrinfo("169.254.169.254")
        self._blocked(
            make_tool(),
            "https://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        )

    def test_basta_una_ip_interna_entre_varias(self, public_dns):
        public_dns.return_value = addrinfo(PUBLIC_IP, "10.0.0.1")
        self._blocked(make_tool(), "https://mixto.com/x")

    def test_http_plano_bloqueado(self):
        out = self._blocked(make_tool(), "http://api.x.com/v1")
        assert "https" in out["error"]

    def test_url_con_credenciales_bloqueada(self):
        self._blocked(make_tool(), "https://api.x.com@169.254.169.254/x")

    def test_nombre_que_no_resuelve(self, public_dns):
        public_dns.side_effect = socket.gaierror("no existe")
        self._blocked(make_tool(), "https://no-existe.invalid/x")

    @pytest.mark.parametrize("url", [
        "https://api.x.com.evil.tld/v1",
        "https://api.x.com@evil.tld/v1",
        "https://api.x.com:8443/v1",
        "https://api.x.combinado.com/v1",
    ])
    def test_base_url_se_compara_como_url(self, url):
        tool = make_tool(config={"base_url": "https://api.x.com"})
        out = self._blocked(tool, url)
        assert "base_url" in out["error"]

    def test_base_url_con_path_no_acepta_hermanos(self):
        tool = make_tool(config={"base_url": "https://api.x.com/v1"})
        self._blocked(tool, "https://api.x.com/v10/admin")

    def test_headers_de_metadata_y_host_se_descartan(self):
        tool = make_tool(config={"default_headers": {"Metadata-Flavor": "Google", "Accept": "a"}})
        with patch("tools.http_request._send", return_value=fake_response()) as req:
            tool.invoke({
                "method": "GET",
                "url": "https://api.x.com/v1",
                "headers": {"metadata-flavor": "Google", "HOST": "metadata.google.internal"},
            })
        sent = {k.lower(): v for k, v in req.call_args[1]["headers"].items()}
        assert "metadata-flavor" not in sent
        assert sent["host"] == "api.x.com"
        assert sent["accept"] == "a"

    def test_puerto_explicito_se_conserva(self):
        tool = make_tool()
        with patch("tools.http_request._send", return_value=fake_response()) as req:
            tool.invoke({"method": "GET", "url": "https://api.x.com:8443/v1"})
        assert req.call_args[0][1] == f"https://{PUBLIC_IP}:8443/v1"
        assert req.call_args[1]["headers"]["Host"] == "api.x.com:8443"


class TestSend:
    """`_send` es lo único que toca la red: se prueba con un transporte falso de httpx."""

    def _client_with(self, handler):
        real_client = __import__("httpx").Client
        transport = __import__("httpx").MockTransport(handler)
        return lambda **kwargs: real_client(transport=transport, **kwargs)

    def test_presenta_el_nombre_por_sni_y_no_sigue_redirects(self):
        from tools import http_request as mod

        seen = {}

        def handler(request):
            seen["sni"] = request.extensions.get("sni_hostname")
            seen["host"] = request.headers["host"]
            return __import__("httpx").Response(
                302, headers={"Location": "http://169.254.169.254/"}
            )

        with patch("tools.http_request.httpx.Client", self._client_with(handler)):
            resp = mod._send(
                "GET", f"https://{PUBLIC_IP}/x", sni_hostname="api.x.com",
                params=None, json_body=None, headers={"Host": "api.x.com"},
                auth=None, timeout=5,
            )

        assert resp.status_code == 302  # se devuelve tal cual, sin ir a metadata
        assert seen == {"sni": "api.x.com", "host": "api.x.com"}
