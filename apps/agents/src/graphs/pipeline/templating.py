"""
Motor de templates del pipeline: {{variables.x}} y {{context.x}}.

Es el ÚNICO renderizador — lo usan los params de nodos tool, set_variables,
append_system_message, system_prompt y system_prompt_extra de agentes, y los
valores de reglas de condiciones. Regla universal: todo campo de config de todo
nodo pasa por aquí al momento de usarse.
"""

import re
from typing import Any, Dict

from core.context import TenantContext

# Namespaces reconocidos. Un template cuyo primer segmento NO esté aquí se deja
# LITERAL (no se reemplaza por vacío): permite que los system prompts contengan
# texto como "{{1}}" (placeholders de Meta) sin que el renderizado los destruya.
_TEMPLATE_ROOTS = {
    "variables",        # bus de datos del pipeline (state.variables)
    "context",          # TenantContext de solo lectura (user_metadata, channel, ...)
    "current_node",
    "current_intent",
    "execution_path",
}

# Campos del TenantContext expuestos al namespace {{context.*}} (solo lectura)
_CONTEXT_FIELDS = {
    "user_metadata", "channel", "timezone", "user_id",
    "conversation_id", "tenant_id", "workflow_id", "user_type",
}

_TEMPLATE_PATTERN = re.compile(r"\{\{([^}]+)\}\}")


def resolve_path(state, path: str, ctx: TenantContext | None = None) -> Any:
    """
    Resuelve un path con notación de punto contra el estado del grafo, o contra
    el TenantContext si el path empieza con "context.".

    Ejemplos:
        resolve_path(state, "variables.intent")             → state["variables"]["intent"]
        resolve_path(state, "variables.user.name")          → state["variables"]["user"]["name"]
        resolve_path(state, "context.user_metadata.phone")  → ctx.user_metadata["phone"]

    Returns:
        El valor en ese path, o None si no existe
    """
    parts = path.split(".")

    if parts[0] == "context":
        if ctx is None or len(parts) < 2 or parts[1] not in _CONTEXT_FIELDS:
            return None
        current: Any = getattr(ctx, parts[1], None)
        parts = parts[2:]
    else:
        current = state

    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        else:
            current = getattr(current, part, None)

        if current is None:
            return None

    return current


def _is_known_template(path: str) -> bool:
    return path.split(".")[0].strip() in _TEMPLATE_ROOTS


def render_template_value(value: Any, state, ctx: TenantContext | None = None) -> Any:
    """
    Resuelve templates {{variables.x}} / {{context.x}} contra el estado y el
    TenantContext, recursivamente sobre dicts y listas.

    Soporta dos formas:
    1. Template completo:  "{{variables.fecha}}"       → devuelve el valor tal cual (cualquier tipo)
    2. Template inline:   "Hola {{variables.nombre}}"  → reemplaza dentro del string

    Los templates con namespace desconocido (p.ej. "{{1}}" en un prompt) se dejan
    literales — nunca se reemplazan por vacío.
    """
    if not isinstance(value, str):
        if isinstance(value, dict):
            return {k: render_template_value(v, state, ctx) for k, v in value.items()}
        if isinstance(value, list):
            return [render_template_value(item, state, ctx) for item in value]
        return value

    matches = _TEMPLATE_PATTERN.findall(value)

    if not matches:
        return value

    # Template completo (el string entero es un template) → devolver tipo original
    if len(matches) == 1 and value.strip() == f"{{{{{matches[0]}}}}}":
        path = matches[0].strip()
        if not _is_known_template(path):
            return value
        return resolve_path(state, path, ctx)

    # Template inline → reemplazar dentro del string (solo namespaces conocidos)
    result = value
    for match in matches:
        path = match.strip()
        if not _is_known_template(path):
            continue
        resolved = resolve_path(state, path, ctx)
        result = result.replace(f"{{{{{match}}}}}", str(resolved) if resolved is not None else "")

    return result


def render_params(params: Dict[str, Any], state, ctx: TenantContext | None = None) -> Dict[str, Any]:
    """
    Renderiza un dict de parámetros reemplazando templates con valores del estado.

    Ejemplo:
        params = {
            "phone": "{{variables.user_phone}}",
            "message": "Hola {{variables.name}}, tu cita es el {{variables.date}}",
            "fixed": "valor_fijo"
        }
        → {
            "phone": "+5212345678",
            "message": "Hola Carlos, tu cita es el 2026-03-27",
            "fixed": "valor_fijo"
          }
    """
    return {k: render_template_value(v, state, ctx) for k, v in params.items()}


def join_dedup(values: list, separator: str) -> str:
    """Une valores en un string, ignorando vacíos y eliminando duplicados por orden."""
    out: list[str] = []
    for v in values:
        s = str(v).strip()
        if s and s not in out:
            out.append(s)
    return separator.join(out)
