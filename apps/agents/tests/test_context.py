"""
Tests para TenantContext (API actual: graph_config / agents_config / agent_tool_instances).
"""

import pytest
import sys
from pathlib import Path

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from core.context import TenantContext


def make_ctx(**overrides) -> TenantContext:
    defaults = dict(
        tenant_id="test-tenant",
        workflow_id="test-workflow",
        conversation_id="test-conv",
        user_type="internal",
        user_id="test-user",
        channel="dashboard",
        timezone="UTC",
        graph_config={"type": "react"},
        agents_config={"default": {"model": "gpt-4o", "temperature": 0.7}},
        agent_tool_instances={
            "default": {
                "uuid-1": {
                    "tool_name": "calculator",
                    "display_name": "Calc",
                    "credentials": {},
                    "config": {},
                    "enabled_functions": ["calculator"],
                }
            }
        },
    )
    defaults.update(overrides)
    return TenantContext(**defaults)


class TestTenantContext:

    def test_context_initialization(self):
        ctx = make_ctx()
        assert ctx.tenant_id == "test-tenant"
        assert ctx.workflow_id == "test-workflow"
        assert ctx.graph_config["type"] == "react"

    def test_missing_required_field_raises(self):
        with pytest.raises(ValueError, match="tenant_id"):
            make_ctx(tenant_id="")

    def test_thread_id_is_stable_composite(self):
        ctx = make_ctx()
        assert ctx.thread_id == "test-tenant:test-workflow:test-conv"

    def test_get_agent_config(self):
        ctx = make_ctx()
        assert ctx.get_agent_config("default")["model"] == "gpt-4o"
        assert ctx.get_agent_config("nonexistent") == {}

    def test_get_agent_tools(self):
        ctx = make_ctx()
        tools = ctx.get_agent_tools("default")
        assert "uuid-1" in tools
        assert ctx.get_agent_tools("nonexistent") == {}

    def test_get_tool_instance(self):
        ctx = make_ctx()
        inst = ctx.get_tool_instance("default", "uuid-1")
        assert inst["tool_name"] == "calculator"
        assert ctx.get_tool_instance("default", "uuid-nope") == {}

    def test_source_falls_back_to_channel(self):
        ctx = make_ctx()
        assert ctx.source == "dashboard"
        ctx2 = make_ctx(user_metadata={"source": "whatsapp"})
        assert ctx2.source == "whatsapp"

    def test_user_type_properties(self):
        assert make_ctx(user_type="internal").is_internal_user
        assert make_ctx(user_type="external").is_external_user

    def test_to_dict_from_dict_round_trip(self):
        ctx = make_ctx(user_metadata={"name": "Carlos"}, message_history=[
            {"role": "user", "content": "hola"},
        ])
        rebuilt = TenantContext.from_dict(ctx.to_dict())
        assert rebuilt.to_dict() == ctx.to_dict()
        assert rebuilt.agents_config == ctx.agents_config
        assert rebuilt.agent_tool_instances == ctx.agent_tool_instances
        assert rebuilt.message_history == ctx.message_history
