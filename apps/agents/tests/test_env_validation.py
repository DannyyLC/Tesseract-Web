"""
`validate_env` corta el arranque en producción si falta una variable crítica, para que Cloud Run
no mande tráfico a una revisión que "arrancó sana" pero no puede funcionar.

Hoy la lista está vacía (la autenticación Gateway → Agents la hace Cloud Run con IAM), así que
estos tests fijan el mecanismo y no una variable concreta.
"""

import sys
from pathlib import Path

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

import pytest  # noqa: E402

from core import env_validation  # noqa: E402


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    monkeypatch.delenv("K_SERVICE", raising=False)
    monkeypatch.delenv("NODE_ENV", raising=False)
    monkeypatch.delenv("UNA_OBLIGATORIA", raising=False)


def test_en_produccion_sin_obligatorias_arranca(monkeypatch):
    monkeypatch.setenv("K_SERVICE", "agents")
    env_validation.validate_env()  # no revienta


def test_en_produccion_falta_una_obligatoria_corta_el_arranque(monkeypatch):
    monkeypatch.setenv("K_SERVICE", "agents")
    monkeypatch.setattr(env_validation, "REQUIRED_IN_PRODUCTION", ["UNA_OBLIGATORIA"])

    with pytest.raises(SystemExit) as exc:
        env_validation.validate_env()
    assert exc.value.code == 1


def test_valor_vacio_cuenta_como_faltante(monkeypatch):
    monkeypatch.setenv("K_SERVICE", "agents")
    monkeypatch.setenv("UNA_OBLIGATORIA", "")
    monkeypatch.setattr(env_validation, "REQUIRED_IN_PRODUCTION", ["UNA_OBLIGATORIA"])

    with pytest.raises(SystemExit):
        env_validation.validate_env()


def test_en_local_no_valida(monkeypatch):
    monkeypatch.setattr(env_validation, "REQUIRED_IN_PRODUCTION", ["UNA_OBLIGATORIA"])
    env_validation.validate_env()  # fuera de Cloud Run no revienta
