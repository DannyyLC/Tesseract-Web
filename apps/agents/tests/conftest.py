"""
Configuración y fixtures compartidos para los tests.
"""

import sys
from pathlib import Path

import pytest
from unittest.mock import Mock

# Agregar src al path para imports
src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))


@pytest.fixture
def mock_llm_response():
    """Mock de respuesta del LLM."""
    mock_message = Mock()
    mock_message.content = "Respuesta del asistente"
    mock_message.tool_calls = []
    return mock_message


@pytest.fixture
def mock_env_vars(monkeypatch):
    """Variables de entorno mock."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-123")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-456")
