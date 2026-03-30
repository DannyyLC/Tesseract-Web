"""
Configuración y fixtures compartidos para los tests.
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch
import sys
from pathlib import Path

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
def sample_request():
    """Request de ejemplo para tests."""
    return {
        "tenant_id": "test-tenant",
        "workflow_id": "test-workflow",
        "user_id": "test-user",
        "conversation_id": "test-conv",
        "channel": "dashboard",
        "user_type": "internal",
        "timezone": "America/Mexico_City",
        "user_message": "¿Cuánto es 2 + 2?",
        "message_history": [],
        "user_metadata": {
            "name": "Test User",
            "email": "test@example.com"
        },
        "agent_config": {
            "graph_type": "react",
            "max_iterations": 10,
            "system_prompt": "Eres un asistente de prueba."
        },
        "model_configs": {
            "default": {
                "model": "gpt-4o",
                "temperature": 0.7
            }
        },
        "enabled_tools": ["calculator"],
        "tool_configs": {
            "calculator": {}
        },
        "credentials": {},
        "enabled_functions": {
            "calculator": ["calculator", "percentage"]
        }
    }


@pytest.fixture
def client():
    """Cliente de prueba para FastAPI."""
    # Importar después de agregar src al path
    from main import app
    return TestClient(app)


@pytest.fixture
def mock_env_vars(monkeypatch):
    """Variables de entorno mock."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-123")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-456")
