"""
Tests para el módulo de autenticación interna (api/auth.py).

Cubre:
- Sin secreto configurado → permite todo (modo dev)
- Token válido → pasa
- Token inválido → 401
- Token ausente cuando hay secreto → 401
- Token vacío cuando hay secreto → 401
"""

import pytest
import sys
from pathlib import Path
from unittest.mock import patch

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from fastapi import HTTPException
from api.auth import verify_internal_token


class TestVerifyInternalToken:
    """Tests para la función verify_internal_token."""

    @pytest.mark.asyncio
    async def test_no_secret_allows_any_request(self):
        """Sin AGENTS_INTERNAL_SECRET configurado, permite cualquier request (modo dev)."""
        with patch.dict("os.environ", {}, clear=True):
            result = await verify_internal_token(x_internal_token=None)
            assert result is None

    @pytest.mark.asyncio
    async def test_no_secret_allows_request_with_token(self):
        """Sin secreto configurado, el token enviado es irrelevante."""
        with patch.dict("os.environ", {}, clear=True):
            result = await verify_internal_token(x_internal_token="cualquier-token")
            assert result is None

    @pytest.mark.asyncio
    async def test_valid_token_passes(self):
        """Token que coincide exactamente con el secreto pasa."""
        with patch.dict("os.environ", {"AGENTS_INTERNAL_SECRET": "mi-secreto-seguro"}):
            result = await verify_internal_token(x_internal_token="mi-secreto-seguro")
            assert result is None

    @pytest.mark.asyncio
    async def test_invalid_token_raises_401(self):
        """Token incorrecto lanza HTTPException 401."""
        with patch.dict("os.environ", {"AGENTS_INTERNAL_SECRET": "mi-secreto-seguro"}):
            with pytest.raises(HTTPException) as exc_info:
                await verify_internal_token(x_internal_token="token-incorrecto")
            assert exc_info.value.status_code == 401
            assert exc_info.value.detail == "Unauthorized"

    @pytest.mark.asyncio
    async def test_missing_token_raises_401_when_secret_set(self):
        """Sin token pero con secreto configurado lanza 401."""
        with patch.dict("os.environ", {"AGENTS_INTERNAL_SECRET": "mi-secreto-seguro"}):
            with pytest.raises(HTTPException) as exc_info:
                await verify_internal_token(x_internal_token=None)
            assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_empty_string_token_raises_401(self):
        """Token vacío lanza 401 cuando hay secreto configurado."""
        with patch.dict("os.environ", {"AGENTS_INTERNAL_SECRET": "mi-secreto-seguro"}):
            with pytest.raises(HTTPException) as exc_info:
                await verify_internal_token(x_internal_token="")
            assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_uses_hmac_compare_digest(self):
        """Verifica que se usa comparación segura (timing-safe) vía hmac.compare_digest."""
        import hmac
        with patch("hmac.compare_digest", return_value=True) as mock_compare:
            with patch.dict("os.environ", {"AGENTS_INTERNAL_SECRET": "secreto"}):
                await verify_internal_token(x_internal_token="cualquier-token")
                mock_compare.assert_called_once_with("cualquier-token", "secreto")
