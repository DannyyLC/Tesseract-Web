"""
Tests para tools/http_request.py — tool HTTP genérica configurable por workflow.
"""

import json
import sys
from pathlib import Path
from unittest.mock import patch, Mock

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from tools.http_request import load_http_request_tools  # noqa: E402


def make_tool(credentials=None, config=None):
    tools = load_http_request_tools(credentials or {}, config or {})
    assert len(tools) == 1
    return tools[0]


def fake_response(status_code=200, text='{"ok": 1}'):
    resp = Mock()
    resp.status_code = status_code
    resp.text = text
    resp.is_success = 200 <= status_code < 300
    return resp


class TestHttpRequestTool:

    def test_absolute_url_get(self):
        tool = make_tool()
        with patch("tools.http_request.httpx.request", return_value=fake_response()) as req:
            out = json.loads(tool.invoke({"method": "GET", "url": "https://api.x.com/v1"}))

        assert out == {"ok": True, "status_code": 200, "body": '{"ok": 1}'}
        assert req.call_args[0] == ("GET", "https://api.x.com/v1")

    def test_relative_path_joins_base_url(self):
        tool = make_tool(config={"base_url": "https://api.x.com"})
        with patch("tools.http_request.httpx.request", return_value=fake_response()) as req:
            tool.invoke({"method": "GET", "url": "/v1/contacts"})
        assert req.call_args[0][1] == "https://api.x.com/v1/contacts"

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
        with patch("tools.http_request.httpx.request", return_value=fake_response()) as req:
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
        with patch("tools.http_request.httpx.request", return_value=fake_response()) as req:
            tool.invoke({"method": "GET", "url": "https://api.x.com/v1"})
        assert req.call_args[1]["headers"]["X-API-Key"] == "K"

    def test_response_truncated_to_max_chars(self):
        tool = make_tool(config={"max_response_chars": 5})
        with patch("tools.http_request.httpx.request",
                   return_value=fake_response(text="0123456789")):
            out = json.loads(tool.invoke({"method": "GET", "url": "https://api.x.com/v1"}))
        assert out["body"] == "01234"

    def test_network_error_returns_structured_error(self):
        import httpx as _httpx
        tool = make_tool()
        with patch("tools.http_request.httpx.request",
                   side_effect=_httpx.RequestError("timeout")):
            out = json.loads(tool.invoke({"method": "GET", "url": "https://api.x.com/v1"}))
        assert out["ok"] is False
        assert "Network error" in out["error"]

    def test_error_status_reports_not_success(self):
        tool = make_tool()
        with patch("tools.http_request.httpx.request",
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
