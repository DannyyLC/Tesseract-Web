"""
WhatsApp Outbound Tool

Provides send_bulk_whatsapp: a LangChain tool that allows agents to send
WhatsApp template messages to multiple recipients in a single call.

SECURITY MODEL:
    from_number, api_key, and available_templates are ALWAYS injected
    by the Gateway into tool config. The AI model provides only:
      - to         (recipient phone number)
      - template_id (UUID of a WhatsAppTemplate in the DB)
      - variables  (dict of component value arrays)

    The model can NEVER choose the sender phone number.

CONFIG injected by Gateway via buildAgentPayload:
    {
        "from_number": "+521234567890",
        "api_key": "<Y_CLOUD_API_KEY>",
        "available_templates": {
            "<template_uuid>": {
                "name": "recordatorio_cita",
                "language": "es_MX",
                "variables": { "body": ["nombre_paciente", "fecha_cita"], ... }
            }
        }
    }
"""

import json
import logging
from typing import Any

import httpx
from langchain_core.tools import BaseTool, tool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

YCLOUD_API_BASE = "https://api.ycloud.com/v2"


# ─── Input schema ─────────────────────────────────────────────────────────────

class WhatsAppMessageItem(BaseModel):
    to: str = Field(description="Número del destinatario en formato E.164 (ej. +521234567890)")
    template_id: str = Field(description="UUID del WhatsAppTemplate registrado en el sistema")
    variables: dict = Field(
        default_factory=dict,
        description=(
            'Variables por componente en orden posicional. '
            'Claves: "body", "header", "buttons". Valores: lista ordenada de strings. '
            'Ejemplo: {"body": ["Juan", "mañana a las 10 AM"]}'
        ),
    )


class BulkWhatsAppInput(BaseModel):
    messages: list[WhatsAppMessageItem] = Field(
        description="Lista de mensajes de WhatsApp a enviar"
    )


# ─── HTTP helpers ─────────────────────────────────────────────────────────────

def _build_template_payload(
    from_number: str,
    to: str,
    template_name: str,
    language: str,
    variables: dict,
) -> dict:
    components: list[dict] = []

    header_vars: list[str] = variables.get("header", [])
    body_vars: list[str] = variables.get("body", [])
    button_vars: list[str] = variables.get("buttons", [])

    if header_vars:
        components.append({
            "type": "header",
            "parameters": [{"type": "text", "text": v} for v in header_vars],
        })

    if body_vars:
        components.append({
            "type": "body",
            "parameters": [{"type": "text", "text": v} for v in body_vars],
        })

    for idx, payload_value in enumerate(button_vars):
        components.append({
            "type": "button",
            "sub_type": "quick_reply",
            "index": idx,
            "parameters": [{"type": "payload", "payload": payload_value}],
        })

    return {
        "from": from_number,
        "to": to,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language, "policy": "deterministic"},
            "components": components,
        },
    }


def _send_single_message(api_key: str, payload: dict, timeout: float = 15.0) -> dict:
    url = f"{YCLOUD_API_BASE}/whatsapp/messages/sendDirectly"
    headers = {"X-API-Key": api_key, "Content-Type": "application/json"}

    try:
        response = httpx.post(url, json=payload, headers=headers, timeout=timeout)
        response.raise_for_status()
        data = response.json()
        return {"ok": True, "message_id": data.get("id", "unknown")}
    except httpx.HTTPStatusError as exc:
        error_body = exc.response.text[:200]
        logger.error(
            "YCloud API error %s for to=%s: %s",
            exc.response.status_code,
            payload.get("to"),
            error_body,
        )
        return {"ok": False, "error": f"HTTP {exc.response.status_code}: {error_body}"}
    except httpx.RequestError as exc:
        logger.error("Network error sending to %s: %s", payload.get("to"), exc)
        return {"ok": False, "error": f"Network error: {str(exc)}"}


# ─── Tool loader ──────────────────────────────────────────────────────────────

def load_whatsapp_outbound_tools(
    credentials: dict[str, Any],
    config: dict[str, Any],
) -> list[BaseTool]:
    """
    Returns the send_bulk_whatsapp LangChain tool.

    config must contain (injected by Gateway, never from the model):
        from_number         str  — número remitente (E.164)
        api_key             str  — YCloud API key
        available_templates dict — {template_uuid: {name, language, variables}}
    """
    from_number: str = config.get("from_number", "")
    api_key: str = config.get("api_key", "")
    available_templates: dict = config.get("available_templates", {})

    if not from_number or not api_key:
        logger.error(
            "send_bulk_whatsapp: from_number o api_key no inyectados en config. Tool deshabilitado."
        )
        return []

    @tool(args_schema=BulkWhatsAppInput)
    def send_bulk_whatsapp(messages: list[WhatsAppMessageItem]) -> str:
        """
        Envía mensajes de plantilla de WhatsApp a múltiples destinatarios.

        Usa esta herramienta cuando necesites enviar recordatorios, notificaciones
        o mensajes programados a una lista de números telefónicos usando una
        plantilla pre-aprobada por Meta.

        Cada mensaje requiere:
        - to: número del destinatario en formato E.164 (+521234567890)
        - template_id: UUID de la plantilla a usar
        - variables: dict con claves "body", "header", "buttons" conteniendo
          listas ordenadas de valores para los marcadores de posición

        Retorna un resumen JSON con los resultados de cada envío.
        """
        results = []

        for msg in messages:
            tpl = available_templates.get(msg.template_id)

            if not tpl:
                logger.warning(
                    "send_bulk_whatsapp: template_id '%s' no encontrado en available_templates. "
                    "Omitiendo destinatario %s.",
                    msg.template_id,
                    msg.to,
                )
                results.append({
                    "to": msg.to,
                    "ok": False,
                    "error": f"Template '{msg.template_id}' no disponible para este workflow",
                })
                continue

            payload = _build_template_payload(
                from_number=from_number,  # SISTEMA — el modelo nunca lo controla
                to=msg.to,
                template_name=tpl["name"],
                language=tpl["language"],
                variables=msg.variables,
            )

            result = _send_single_message(api_key, payload)
            results.append({"to": msg.to, **result})

            logger.info(
                "send_bulk_whatsapp: to=%s template=%s ok=%s",
                msg.to,
                tpl["name"],
                result["ok"],
            )

        sent = sum(1 for r in results if r.get("ok"))
        failed = len(results) - sent

        return json.dumps(
            {"total": len(results), "sent": sent, "failed": failed, "results": results},
            ensure_ascii=False,
        )

    return [send_bulk_whatsapp]
