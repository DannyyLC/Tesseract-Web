"""
Human handoff tools.

Tooling to request human intervention from the AI workflow.
The Gateway consumes this signal and toggles HITL on the conversation.
"""

from langchain_core.tools import BaseTool, tool


@tool
def request_human_handoff(reason: str = "Necesita atencion humana") -> str:
    """
    Solicita escalar la conversacion a un humano.

    Args:
        reason: Motivo breve de la escalacion.

    Returns:
        Payload JSON-like en texto para facilitar parseo en el Gateway.
    """
    normalized_reason = (reason or "Necesita atencion humana").strip()
    return (
        '{"requested": true, "reason": "'
        + normalized_reason.replace('"', "'")
        + '", "source": "request_human_handoff"}'
    )


def load_human_handoff_tools() -> list[BaseTool]:
    """Retorna tools de handoff humano."""
    return [request_human_handoff]
