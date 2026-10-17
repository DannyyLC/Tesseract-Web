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

DESTINOS PERMITIDOS: solo `https` hacia IPs públicas. La petición sale desde dentro de
Google Cloud, así que sin este filtro la tool alcanza lo que el mundo exterior no: el
servidor de metadata (que entrega el token de la service account del servicio, y con él
los secretos que esa cuenta puede leer), loopback y la red privada. El nombre se resuelve
una vez, se validan todas sus IPs y se conecta a la IP ya validada: si se dejara a httpx
resolver de nuevo, un DNS con TTL corto podría contestar una IP pública al validar y una
interna al conectar.
"""

import ipaddress
import json
import logging
import socket
from typing import Any, Optional
from urllib.parse import SplitResult, urlsplit, urlunsplit

import httpx
from langchain_core.tools import BaseTool, tool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

DEFAULT_ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]
MAX_TIMEOUT_SECONDS = 60.0

# Nadie tiene por qué fijarlos, ni el modelo ni la config: `Host` ya lo pone la tool (ver
# `_pin_to_ip`) y `Metadata-Flavor` solo sirve para hablarle al servidor de metadata.
_FORBIDDEN_HEADERS = {"host", "metadata-flavor", "x-google-metadata-request"}


class BlockedDestinationError(ValueError):
    """La URL apunta a un destino al que la tool no debe llegar."""


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


def _strip_query(url: str) -> str:
    """Deja la URL sin query string ni fragmento, para poder loguearla sin datos."""
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))


def _drop_forbidden_headers(headers: Optional[dict]) -> dict:
    return {
        k: v for k, v in (headers or {}).items()
        if str(k).strip().lower() not in _FORBIDDEN_HEADERS
    }


def _is_public_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    # `is_global` ya descarta privadas, loopback, link-local (169.254/16, donde vive el
    # servidor de metadata), CGNAT, reservadas y documentación. Una IPv6 que envuelve una
    # IPv4 (::ffff:10.0.0.1) se juzga por la IPv4 de dentro.
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


def _resolve_public_ip(parts: SplitResult) -> str:
    """
    Valida la URL y devuelve la IP pública a la que hay que conectar.

    Todas las IPs del nombre tienen que ser públicas, no solo la primera: si una sola es
    interna se rechaza, porque no se controla cuál elegiría el sistema al conectar.
    """
    if parts.scheme != "https":
        raise BlockedDestinationError("Solo se permiten URLs https")
    if parts.username or parts.password:
        raise BlockedDestinationError("La URL no puede llevar usuario ni contraseña")
    host = parts.hostname
    if not host:
        raise BlockedDestinationError("La URL no tiene host")

    try:
        infos = socket.getaddrinfo(host, parts.port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise BlockedDestinationError(f"No se pudo resolver {host}: {exc}") from exc

    ips = {ipaddress.ip_address(info[4][0].split("%")[0]) for info in infos}
    if not ips or not all(_is_public_ip(ip) for ip in ips):
        raise BlockedDestinationError(f"Destino no permitido: {host} resuelve a una IP interna")
    # IPv4 primero: es lo que sale seguro de Cloud Run sin egress IPv6.
    return str(sorted(ips, key=lambda ip: (ip.version, str(ip)))[0])


def _pin_to_ip(parts: SplitResult, ip: str) -> tuple[str, str]:
    """
    Reescribe la URL para conectar a `ip` sin cambiar a quién se le habla.

    Devuelve (url_con_ip, host_header). El certificado se sigue validando contra el nombre
    original porque la petición viaja con `sni_hostname` (ver el llamador).
    """
    ip_literal = f"[{ip}]" if ":" in ip else ip
    netloc = f"{ip_literal}:{parts.port}" if parts.port else ip_literal
    host_header = f"{parts.hostname}:{parts.port}" if parts.port else parts.hostname
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment)), host_header


def _within_base_url(url: SplitResult, base: SplitResult) -> bool:
    """
    Compara como URLs y no como texto: con `startswith`, `https://api.x.com` aceptaba
    `https://api.x.com.evil.tld` y `https://api.x.com@169.254.169.254`.
    """
    if (url.scheme, url.hostname, url.port) != (base.scheme, base.hostname, base.port):
        return False
    base_path = base.path.rstrip("/")
    return url.path == base_path or url.path.startswith(base_path + "/")


def _send(
    method: str,
    url: str,
    *,
    sni_hostname: str,
    params: Optional[dict],
    json_body: Optional[dict],
    headers: dict,
    auth,
    timeout: float,
) -> httpx.Response:
    """
    Envía la petición a la IP fijada presentando `sni_hostname`, de modo que el certificado
    se valide contra el nombre real y no contra la IP.

    Va por `build_request` porque `httpx.request` no acepta `extensions`. Sin seguir
    redirects: el destino de un 3xx no pasó por la validación; el modelo recibe la respuesta
    y, si pide la nueva URL, esa sí se valida.
    """
    with httpx.Client(timeout=timeout, follow_redirects=False) as client:
        request = client.build_request(
            method,
            url,
            params=params,
            json=json_body,
            headers=headers,
            extensions={"sni_hostname": sni_hostname},
        )
        return client.send(request, auth=auth)


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
    default_headers: dict = _drop_forbidden_headers((config or {}).get("default_headers", {}))
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
                if not _within_base_url(urlsplit(url), urlsplit(base_url)):
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
                    {"ok": False, "error": "URL debe ser absoluta (https)"},
                    ensure_ascii=False,
                )
            full_url = url

        parts = urlsplit(full_url)
        try:
            ip = _resolve_public_ip(parts)
        except BlockedDestinationError as exc:
            # Warning y no error: lo normal es que lo provoque un prompt, no una falla nuestra.
            logger.warning("http_request bloqueado: %s %s: %s", method, _strip_query(full_url), exc)
            return json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False)
        pinned_url, host_header = _pin_to_ip(parts, ip)

        # Los headers de auth SIEMPRE ganan sobre los que mande el modelo, y `Host` lo fija
        # la tool: apunta al nombre original aunque la conexión vaya a la IP.
        request_headers = {
            **default_headers,
            **_drop_forbidden_headers(headers),
            **auth_headers,
            "Host": host_header,
        }

        try:
            response = _send(
                method,
                pinned_url,
                sni_hostname=parts.hostname,
                params=query_params,
                json_body=json_body,
                headers=request_headers,
                auth=basic_auth,
                timeout=timeout,
            )
            body = response.text[:max_response_chars]
            # Sin query string: es una tool genérica y nada impide que un workflow meta
            # datos del cliente en los parámetros. El endpoint sin query basta para saber
            # contra qué se llamó; la URL completa sale con LOG_LEVEL=debug.
            logger.info(
                "http_request: %s %s → %s (%d chars)",
                method, _strip_query(full_url), response.status_code, len(body),
            )
            logger.debug("http_request: URL completa %s (params=%s)", full_url, query_params)
            return json.dumps({
                "ok": response.is_success,
                "status_code": response.status_code,
                "body": body,
            }, ensure_ascii=False)
        except httpx.RequestError as exc:
            logger.error(
                "http_request network error: %s %s: %s", method, _strip_query(full_url), exc
            )
            return json.dumps(
                {"ok": False, "error": f"Network error: {exc}"}, ensure_ascii=False
            )

    return [http_request]
