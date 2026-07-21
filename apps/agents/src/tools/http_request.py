"""
HTTP Request Tool - Peticiones HTTP genéricas configurables por workflow.

La tool más reutilizable del catálogo: permite integrar cualquier API REST sin
escribir una tool nueva. La seguridad viene de la config inyectada por el Gateway
(nunca del modelo):

CONFIG (por tool instance, inyectada por el Gateway):
    {
        "base_url": "https://api.ejemplo.com",   # Si se define, el modelo solo elige el path
        "default_headers": {"Accept": "application/json"},
        "allowed_methods": ["GET", "POST"],       # Default: GET/POST/PUT/PATCH/DELETE
        "timeout": 15,                            # Segundos (tope 60)
        "max_response_chars": 4000                # Truncado de la respuesta al LLM
    }

CREDENTIALS (descifradas por el Gateway, nunca visibles al modelo):
    {"auth_type": "bearer", "token": "..."}
    {"auth_type": "header", "header_name": "X-API-Key", "token": "..."}
    {"auth_type": "basic", "username": "...", "password": "..."}
"""

import json
import logging
from typing import Any, Optional

import httpx
from langchain_core.tools import BaseTool, tool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

DEFAULT_ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]
MAX_TIMEOUT_SECONDS = 60.0


class HttpRequestInput(BaseModel):
    method: str = Field(description="Método HTTP: GET, POST, PUT, PATCH o DELETE")
    url: str = Field(
        description=(
            "URL completa, o solo el path (ej. /v1/contacts) si la tool tiene base_url configurada"
        )
    )
    query_params: Optional[dict] = Field(
        default=None, description="Parámetros de query string como dict"
    )
    json_body: Optional[dict] = Field(
        default=None, description="Cuerpo JSON de la petición (para POST/PUT/PATCH)"
    )
    headers: Optional[dict] = Field(
        default=None, description="Headers adicionales (no pueden sobrescribir los de autenticación)"
    )


def _build_auth_headers(credentials: dict[str, Any]) -> dict[str, str]:
    auth_type = (credentials or {}).get("auth_type", "")
    if auth_type == "bearer" and credentials.get("token"):
        return {"Authorization": f"Bearer {credentials['token']}"}
    if auth_type == "header" and credentials.get("token"):
        return {credentials.get("header_name", "X-API-Key"): credentials["token"]}
    return {}


def _build_basic_auth(credentials: dict[str, Any]):
    if (credentials or {}).get("auth_type") == "basic":
        return (credentials.get("username", ""), credentials.get("password", ""))
    return None


def load_http_request_tools(
    credentials: dict[str, Any],
    config: dict[str, Any],
) -> list[BaseTool]:
    """Retorna la tool http_request configurada para esta instancia."""
    base_url: str = (config or {}).get("base_url", "").rstrip("/")
    default_headers: dict = (config or {}).get("default_headers", {})
    allowed_methods = [
        m.upper() for m in (config or {}).get("allowed_methods", DEFAULT_ALLOWED_METHODS)
    ]
    timeout = min(float((config or {}).get("timeout", 15)), MAX_TIMEOUT_SECONDS)
    max_response_chars = int((config or {}).get("max_response_chars", 4000))

    auth_headers = _build_auth_headers(credentials or {})
    basic_auth = _build_basic_auth(credentials or {})

    @tool(args_schema=HttpRequestInput)
    def http_request(
        method: str,
        url: str,
        query_params: Optional[dict] = None,
        json_body: Optional[dict] = None,
        headers: Optional[dict] = None,
    ) -> str:
        """
        Ejecuta una petición HTTP a una API externa y devuelve la respuesta.

        Usa esta herramienta para consultar o enviar datos a servicios HTTP
        (APIs REST). La autenticación ya está configurada; no incluyas tokens.
        """
        method = (method or "").upper()
        if method not in allowed_methods:
            return json.dumps({
                "ok": False,
                "error": f"Método '{method}' no permitido. Permitidos: {allowed_methods}",
            }, ensure_ascii=False)

        if base_url:
            if url.startswith(("http://", "https://")):
                if not url.startswith(base_url):
                    return json.dumps({
                        "ok": False,
                        "error": f"URL fuera del base_url configurado ({base_url})",
                    }, ensure_ascii=False)
                full_url = url
            else:
                full_url = f"{base_url}/{url.lstrip('/')}"
        else:
            if not url.startswith(("http://", "https://")):
                return json.dumps(
                    {"ok": False, "error": "URL debe ser absoluta (http/https)"},
                    ensure_ascii=False,
                )
            full_url = url

        # Los headers de auth SIEMPRE ganan sobre los que mande el modelo
        request_headers = {**default_headers, **(headers or {}), **auth_headers}

        try:
            response = httpx.request(
                method,
                full_url,
                params=query_params,
                json=json_body,
                headers=request_headers,
                auth=basic_auth,
                timeout=timeout,
            )
            body = response.text[:max_response_chars]
            logger.info(
                "http_request: %s %s → %s (%d chars)",
                method, full_url, response.status_code, len(body),
            )
            return json.dumps({
                "ok": response.is_success,
                "status_code": response.status_code,
                "body": body,
            }, ensure_ascii=False)
        except httpx.RequestError as exc:
            logger.error("http_request network error: %s %s: %s", method, full_url, exc)
            return json.dumps(
                {"ok": False, "error": f"Network error: {exc}"}, ensure_ascii=False
            )

    return [http_request]
