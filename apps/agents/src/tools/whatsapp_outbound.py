"""
WhatsApp Outbound Tool

Provides send_bulk_whatsapp: a LangChain tool that allows agents to send
WhatsApp template messages to multiple recipients in a single call.

SECURITY MODEL:
    provider, from_number, api_key/access_token, and available_templates are
    ALWAYS injected by the Gateway into tool config. The AI model provides only:
      - to         (recipient phone number)
      - template_id (UUID of a WhatsAppTemplate in the DB)
      - variables  (dict of component value arrays)

    The model can NEVER choose the sender phone number or the provider.

CONFIG injected by Gateway via buildAgentPayload (apps/gateway .../workflows.service.ts):
    {
        "provider": "ycloud" | "meta",
        "from_number": "+521234567890",
        "api_key": "<Y_CLOUD_API_KEY>",              # provider == "ycloud"
        "phone_number_id": "<META_PHONE_NUMBER_ID>",  # provider == "meta"
        "access_token": "<META_ACCESS_TOKEN>",        # provider == "meta"
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

from core.redaction import mask_phone

logger = logging.getLogger(__name__)

YCLOUD_API_BASE = "https://api.ycloud.com/v2"
META_API_BASE = "https://graph.facebook.com/v21.0"


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

def _build_template_components(variables: dict) -> list[dict]:
    """Común a ambos proveedores: YCloud replica el formato de componentes de la
    Cloud API de Meta."""
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
            "parameters": [{"type": "text", "text": str(v) if v is not None else "No Disponible" } for v in body_vars],
        })

    for idx, payload_value in enumerate(button_vars):
        components.append({
            "type": "button",
            "sub_type": "quick_reply",
            "index": idx,
            "parameters": [{"type": "payload", "payload": payload_value}],
        })

    return components


def _build_template_payload(
    provider: str,
    from_number: str,
    to: str,
    template_name: str,
    language: str,
    variables: dict,
) -> dict:
    components = _build_template_components(variables)

    # El payload trae el número destino y los `components`, o sea las variables de la
    # plantilla: nombres, montos, lo que lleve el template. Eso es dato del cliente y no
    # va a Cloud Logging, donde se retiene 30 días. Para depurar basta saber qué plantilla
    # se armó; el detalle se ve en local subiendo LOG_LEVEL.
    logger.debug("calling template %s (%s) with %d component(s)", template_name, provider, len(components))

    if provider == "meta":
        # La Cloud API de Meta no lleva "from": el remitente lo determina el
        # phone_number_id contra el que se llama, y no acepta "policy" en language.
        return {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language},
                "components": components,
            },
        }

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


def _extract_message_id(provider: str, data: dict) -> str:
    if provider == "meta":
        messages = data.get("messages") or []
        return messages[0].get("id", "unknown") if messages else "unknown"
    return data.get("id", "unknown")


def _send_single_message(
    provider: str,
    payload: dict,
    *,
    api_key: str = "",
    access_token: str = "",
    phone_number_id: str = "",
    timeout: float = 15.0,
) -> dict:
    if provider == "meta":
        url = f"{META_API_BASE}/{phone_number_id}/messages"
        headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    else:
        url = f"{YCLOUD_API_BASE}/whatsapp/messages/sendDirectly"
        headers = {"X-API-Key": api_key, "Content-Type": "application/json"}

    try:
        response = httpx.post(url, json=payload, headers=headers, timeout=timeout)
        response.raise_for_status()
        data = response.json()
        return {"ok": True, "message_id": _extract_message_id(provider, data)}
    except httpx.HTTPStatusError as exc:
        error_body = exc.response.text[:200]
        logger.error(
            "%s API error %s for to=%s: %s",
            provider,
            exc.response.status_code,
            mask_phone(payload.get("to")),
            error_body,
        )
        return {"ok": False, "error": f"HTTP {exc.response.status_code}: {error_body}"}
    except httpx.RequestError as exc:
        logger.error("Network error sending to %s: %s", mask_phone(payload.get("to")), exc)
        return {"ok": False, "error": f"Network error: {str(exc)}"}


# ─── Tool loader ──────────────────────────────────────────────────────────────

def load_whatsapp_outbound_tools(
    credentials: dict[str, Any],
    config: dict[str, Any],
) -> list[BaseTool]:
    """
    Returns the send_bulk_whatsapp LangChain tool.

    config must contain (injected by Gateway, never from the model):
        provider             str  — "ycloud" (default) o "meta"
        from_number          str  — número remitente (E.164)
        api_key              str  — YCloud API key (provider == "ycloud")
        phone_number_id      str  — Meta phone_number_id (provider == "meta")
        access_token         str  — Meta access token (provider == "meta")
        available_templates  dict — {template_uuid: {name, language, variables}}
        auto_fill_variables  dict — opcional: {nombre_variable: valor}. Si una
                                    plantilla declara una variable con ese nombre,
                                    el valor se inserta en su posición declarada
                                    (el modelo no la provee ni la controla).
    """
    provider: str = config.get("provider") or "ycloud"
    from_number: str = config.get("from_number", "")
    api_key: str = config.get("api_key", "")
    phone_number_id: str = config.get("phone_number_id", "")
    access_token: str = config.get("access_token", "")
    available_templates: dict = config.get("available_templates", {})
    auto_fill_variables: dict = config.get("auto_fill_variables", {}) or {}

    if provider == "meta":
        if not phone_number_id or not access_token:
            logger.error(
                "send_bulk_whatsapp: phone_number_id o access_token no inyectados en config "
                "para provider 'meta'. Tool deshabilitado."
            )
            return []
    elif not from_number or not api_key:
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
                    mask_phone(msg.to),
                )
                results.append({
                    "to": msg.to,
                    "ok": False,
                    "error": f"Template '{msg.template_id}' no disponible para este workflow",
                })
                continue

            # Auto-fill: variables declaradas por la plantilla cuyo valor lo pone
            # el sistema (p.ej. client_number), insertadas en su posición declarada.
            if auto_fill_variables:
                for channel in ("header", "body"):
                    declared = tpl.get(channel) or []
                    if not isinstance(declared, list):
                        continue
                    values = msg.variables.setdefault(channel, [])
                    for idx, var_name in enumerate(declared):
                        if var_name in auto_fill_variables:
                            fill_value = str(auto_fill_variables[var_name] or "No disponible")
                            values.insert(min(idx, len(values)), fill_value)

            payload = _build_template_payload(
                provider=provider,
                from_number=from_number,  # SISTEMA — el modelo nunca lo controla
                to=msg.to,
                template_name=tpl["name"],
                language=tpl["language"],
                variables=msg.variables,
            )

            result = _send_single_message(
                provider,
                payload,
                api_key=api_key,
                access_token=access_token,
                phone_number_id=phone_number_id,
            )
            results.append({"to": msg.to, **result})

            # Sin `to` ni `variables`: son el teléfono del destinatario y el contenido
            # personalizado del mensaje. Lo que hace falta para operar es si el envío
            # salió y con qué plantilla; a quién se le mandó queda en la ejecución.
            logger.info(
                "send_bulk_whatsapp: provider=%s from=%s template=%s ok=%s",
                provider,
                from_number,
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
