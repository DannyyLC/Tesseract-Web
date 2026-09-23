"""
Human Intervention Tool (determinista)

A diferencia de `request_human_handoff` (tools/human_handoff.py), que solo se activa si el
LLM decide llamarla en su turno, esta tool está pensada para invocarse desde un nodo `tool`
del `graph` — determinista, sin que el LLM intervenga. Sirve para los casos donde hace falta
pausar la conversación (HITL) *antes* de que el agente llegue a responder, por ejemplo al
detectar un dato del cliente que descalifica la conversación por completo (un número foráneo
a la plaza que atiende ese workflow).

CONFIG (inyectada por el Gateway al construir el payload):
    {"api_base": "https://gateway..."}

CREDENTIALS (token con alcance, firmado por el Gateway; el modelo nunca lo ve):
    {"access_token": "..."}

El token está acotado a una conversación específica (organizationId + conversationId +
workflowId, ver `InterventionTokenService` en el Gateway) — no puede usarse para intervenir
ninguna otra conversación.
"""

import logging
from typing import Any

import httpx
from langchain_core.tools import BaseTool, tool

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_SECONDS = 15.0


def load_human_intervention_tools(
    credentials: dict[str, Any],
    config: dict[str, Any],
) -> list[BaseTool]:
    api_base: str = config.get("api_base", "")
    access_token: str = (credentials or {}).get("access_token", "")

    if not api_base or not access_token:
        # Igual que dataset/whatsapp_outbound: sin URL o sin token no hay tool que ofrecer.
        # Devolver una rota sería peor — el nodo la invocaría y fallaría en cada intento.
        logger.warning(
            "human_intervention: falta configuración (api_base=%s, token=%s). Tool deshabilitada.",
            bool(api_base),
            bool(access_token),
        )
        return []

    @tool
    def activate_human_intervention(reason: str = "Requiere atención humana") -> str:
        """
        Activa human-in-the-loop en la conversación actual de forma inmediata: la IA deja de
        responder hasta que un humano la reactive, y se notifica al equipo. No pasa por el
        LLM — se invoca directo desde un nodo `tool` del workflow.

        Args:
            reason: Motivo breve, se usa en la notificación al equipo.
        """
        url = f"{api_base.rstrip('/')}/internal/conversations/intervention"
        headers = {"Authorization": f"Bearer {access_token}"}

        try:
            response = httpx.post(
                url,
                json={"reason": reason},
                headers=headers,
                timeout=DEFAULT_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            return "Intervención humana activada."
        except httpx.HTTPStatusError as exc:
            logger.error(
                "human_intervention: gateway respondió %s", exc.response.status_code
            )
            return f"No se pudo activar la intervención humana: HTTP {exc.response.status_code}"
        except httpx.RequestError as exc:
            logger.error("human_intervention: error de red: %s", exc)
            return "No se pudo activar la intervención humana: error de red"

    return [activate_human_intervention]
