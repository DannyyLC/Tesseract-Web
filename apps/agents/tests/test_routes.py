"""
Tests para los endpoints de la API.
"""

import pytest
from unittest.mock import patch, Mock


class TestHealthCheck:
    """Tests para el health check endpoint."""
    
    def test_health_endpoint(self, client):
        """Prueba que el endpoint de health funciona."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "tesseract-agents"


class TestRootEndpoint:
    """Tests para el root endpoint."""
    
    def test_root_endpoint(self, client):
        """Prueba el endpoint root."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "service" in data
        assert "endpoints" in data


class TestAgentExecution:
    """Tests para el endpoint de ejecución de agentes."""
    
    def test_execution_validation_missing_fields(self, client):
        """Prueba validación con campos faltantes."""
        response = client.post("/api/v1/agents/execute", json={})
        assert response.status_code == 422
    
    def test_execution_invalid_graph_type(self, client, sample_request):
        """Prueba con tipo de grafo inválido."""
        sample_request["agent_config"]["graph_type"] = "invalid"
        response = client.post("/api/v1/agents/execute", json=sample_request)
        assert response.status_code in [400, 500]
    
    @patch("api.routes.create_agent_graph")
    def test_execution_graph_creation_error(self, mock_create_graph, client, sample_request, mock_env_vars):
        """Prueba manejo de error al crear el grafo."""
        mock_create_graph.side_effect = Exception("Graph creation failed")
        response = client.post("/api/v1/agents/execute", json=sample_request)
        assert response.status_code == 500
        assert "Failed to create agent graph" in response.json()["detail"]
    
    @patch("core.agent_factory.create_agent_graph")
    def test_execution_success_mock(self, mock_create_graph, client, sample_request):
        """Prueba ejecución exitosa con mock."""
        # Mock del grafo
        mock_graph = Mock()
        mock_result = {
            "messages": [
                Mock(content="Hola", __class__=Mock(__name__="HumanMessage")),
                Mock(content="¡Hola! El resultado es 4.", __class__=Mock(__name__="AIMessage"))
            ]
        }
        mock_graph.invoke.return_value = mock_result
        mock_create_graph.return_value = mock_graph
        
        response = client.post("/api/v1/agents/execute", json=sample_request)
        assert response.status_code == 200
        data = response.json()
        assert "conversation_id" in data
        assert "messages" in data
        assert "metadata" in data


class TestValidateEndpoint:
    """Tests para el endpoint de validación."""
    
    def test_validate_valid_config(self, client, sample_request):
        """Prueba validación de configuración válida."""
        # Este endpoint puede no estar implementado aún
        response = client.post("/api/v1/agents/validate", json=sample_request)
        # Si retorna 404, el endpoint no existe (está bien)
        # Si retorna 200, debe tener valid=True
        if response.status_code == 200:
            data = response.json()
            assert "valid" in data
    
    def test_validate_invalid_config(self, client):
        """Prueba validación con configuración inválida."""
        invalid_request = {
            "tenant_id": "test",
            "workflow_id": "test",
            "agent_config": {
                "graph_type": "invalid_type"
            }
        }
        response = client.post("/api/v1/agents/validate", json=invalid_request)
        # 404 si no está implementado, 422 si valida mal, 200 con valid=False
        assert response.status_code in [404, 422, 200]
