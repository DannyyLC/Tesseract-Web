"""
Focused tests for human handoff tool and metadata extraction.
"""

import json

from langchain_core.messages import HumanMessage, ToolMessage

from api.routes import extract_human_handoff_from_messages
from tools.human_handoff import request_human_handoff


def test_request_human_handoff_returns_structured_payload():
    output = request_human_handoff.invoke({"reason": "Quiere hablar con humano"})
    parsed = json.loads(output)

    assert parsed["requested"] is True
    assert parsed["reason"] == "Quiere hablar con humano"
    assert parsed["source"] == "request_human_handoff"


def test_extract_human_handoff_from_tool_message():
    tool_msg = ToolMessage(
        content='{"requested": true, "reason": "Caso sensible"}',
        tool_call_id="call_1",
        name="request_human_handoff_Soporte",
    )

    result = extract_human_handoff_from_messages([HumanMessage(content="hola"), tool_msg])

    assert result is not None
    assert result["requested"] is True
    assert result["reason"] == "Caso sensible"
    assert result["tool_name"] == "request_human_handoff_Soporte"


def test_extract_human_handoff_returns_none_when_not_present():
    result = extract_human_handoff_from_messages([HumanMessage(content="solo conversacion")])
    assert result is None
