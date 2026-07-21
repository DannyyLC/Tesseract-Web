"""
Human handoff tools.

Tooling to request human intervention from the AI workflow.
The Gateway consumes this signal and toggles HITL on the conversation.
"""

import json

from langchain_core.tools import BaseTool, tool


@tool
def request_human_handoff(reason: str = "Necesita atencion humana") -> str:
    """
    Solicita escalar la conversacion a un humano.

    Args:
        reason: Motivo breve de la escalacion.

    Returns:
        Payload JSON en texto para facilitar parseo en el Gateway.
    """
    normalized_reason = (reason or "Necesita atencion humana").strip()
    return json.dumps(
        {
            "requested": True,
            "reason": normalized_reason,
            "source": "request_human_handoff",
        },
        ensure_ascii=False,
    )


def load_human_handoff_tools() -> list[BaseTool]:
    """Retorna tools de handoff humano."""
    return [request_human_handoff]
