"""
Utilidades para convertir mensajes entre formatos LangChain y dict.
Sin dependencias de FastAPI — seguro importar desde gRPC servicer o HTTP routes.
"""

import json
import logging
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

logger = logging.getLogger(__name__)


def convert_message_history_to_langchain(history: list[dict]) -> list:
    langchain_messages = []
    for msg in history:
        role = msg.get("role", "").lower()
        content = msg.get("content", "")
        if role in ("human", "user"):
            langchain_messages.append(HumanMessage(content=content))
        elif role in ("assistant", "ai"):
            langchain_messages.append(AIMessage(content=content))
        elif role == "system":
            langchain_messages.append(SystemMessage(content=content))
        else:
            logger.warning(f"Unknown message role: {role}, treating as human")
            langchain_messages.append(HumanMessage(content=content))
    return langchain_messages


def convert_langchain_messages_to_dict(messages: list) -> list[dict]:
    result = []
    for msg in messages:
        msg_type = type(msg).__name__
        if msg_type in ("SystemMessage", "ToolMessage"):
            continue
        if msg_type == "HumanMessage":
            role = "user"
            content = msg.content if hasattr(msg, "content") else str(msg)
        elif msg_type == "AIMessage":
            role = "assistant"
            content = msg.content if hasattr(msg, "content") else str(msg)
            if not content or not content.strip():
                continue
        else:
            role = "unknown"
            content = msg.content if hasattr(msg, "content") else str(msg)
            logger.warning(f"Unknown message type in response: {msg_type}")
        result.append({"role": role, "content": content})
    return result


def extract_human_handoff_from_messages(messages: list) -> dict | None:
    for msg in messages:
        if type(msg).__name__ != "ToolMessage":
            continue
        tool_name = getattr(msg, "name", "") or ""
        if not str(tool_name).startswith("request_human_handoff"):
            continue
        raw_content = getattr(msg, "content", "") or ""
        reason = "Necesita atencion humana"
        try:
            parsed = json.loads(raw_content) if isinstance(raw_content, str) else {}
            if isinstance(parsed, dict):
                reason = str(parsed.get("reason") or reason)
        except Exception:
            reason = str(raw_content).strip() or reason
        return {"requested": True, "reason": reason, "tool_name": str(tool_name)}
    return None
