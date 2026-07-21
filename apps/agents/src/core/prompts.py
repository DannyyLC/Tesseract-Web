"""
Utilidades de system prompt compartidas por todos los grafos.

Centraliza el bloque de contexto temporal y la inyección/reemplazo del
SystemMessage — antes duplicados en react, router, supervisor y pipeline.
"""

import logging
from datetime import datetime

import pytz
from langchain_core.messages import SystemMessage

from core.context import TenantContext

logger = logging.getLogger(__name__)


def build_time_context(ctx: TenantContext) -> str:
    """Bloque de fecha/hora local que se suma al system prompt (evita alucinaciones temporales)."""
    try:
        local_tz = pytz.timezone(ctx.timezone)
    except pytz.UnknownTimeZoneError:
        logger.warning(f"[{ctx.workflow_id}] Unknown timezone '{ctx.timezone}', falling back to UTC")
        local_tz = pytz.UTC

    current_time = datetime.now(local_tz)
    return (
        f"\n---\n"
        f"SYSTEM DYNAMIC CONTEXT:\n"
        f"Today's Date: {current_time.strftime('%A, %B %d, %Y')}\n"
        f"Current Local Time: {current_time.strftime('%I:%M %p')} (Timezone: {ctx.timezone})\n"
        f"---\n"
    )


def apply_system_prompt(messages: list, system_prompt: str) -> list:
    """
    Devuelve la lista de mensajes con el system prompt como primer mensaje.

    Si ya hay un SystemMessage al inicio se REEMPLAZA (mantiene la hora del
    time-context actualizada en cada llamada); si no, se antepone.
    """
    if not system_prompt:
        return messages
    if not messages or messages[0].type != "system":
        return [SystemMessage(content=system_prompt)] + messages
    replaced = list(messages)
    replaced[0] = SystemMessage(content=system_prompt)
    return replaced
