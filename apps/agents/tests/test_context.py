"""
Tests para TenantContext.
"""

import pytest
import sys
from pathlib import Path

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from core.context import TenantContext


class TestTenantContext:
    """Tests para la clase TenantContext."""
    
    def test_context_initialization(self):
        """Prueba inicialización básica."""
        ctx = TenantContext(
            tenant_id="test-tenant",
            workflow_id="test-workflow",
            user_id="test-user",
            conversation_id="test-conv",
            channel="dashboard",
            user_type="internal",
            timezone="UTC",
            agent_config={"graph_type": "react"},
            model_configs={"default": {"model": "gpt-4o"}},
            enabled_tools=[],
            tool_configs={},
            credentials={},
            enabled_functions={}
        )
        
        assert ctx.tenant_id == "test-tenant"
        assert ctx.workflow_id == "test-workflow"
        assert ctx.agent_config["graph_type"] == "react"
    
    def test_get_model_config(self):
        """Prueba obtener configuración de modelo."""
        ctx = TenantContext(
            tenant_id="test",
            workflow_id="test",
            user_id="test",
            conversation_id="test",
            channel="dashboard",
            user_type="internal",
            timezone="UTC",
            agent_config={},
            model_configs={
                "default": {"model": "gpt-4o", "temperature": 0.7}
            },
            enabled_tools=[],
            tool_configs={},
            credentials={},
            enabled_functions={}
        )
        
        config = ctx.get_model_config("default")
        assert config["model"] == "gpt-4o"
        assert config["temperature"] == 0.7
    
    def test_get_model_config_missing(self):
        """Prueba obtener configuración inexistente."""
        ctx = TenantContext(
            tenant_id="test",
            workflow_id="test",
            user_id="test",
            conversation_id="test",
            channel="dashboard",
            user_type="internal",
            timezone="UTC",
            agent_config={},
            model_configs={"default": {"model": "gpt-4o"}},
            enabled_tools=[],
            tool_configs={},
            credentials={},
            enabled_functions={}
        )
        
        config = ctx.get_model_config("nonexistent")
        assert config == {} or config is None
    
    def test_get_tool_credentials(self):
        """Prueba obtener credenciales de tool."""
        ctx = TenantContext(
            tenant_id="test",
            workflow_id="test",
            user_id="test",
            conversation_id="test",
            channel="dashboard",
            user_type="internal",
            timezone="UTC",
            agent_config={},
            model_configs={},
            enabled_tools=["calculator"],
            tool_configs={},
            credentials={"calculator": {"api_key": "test"}},
            enabled_functions={}
        )
        
        creds = ctx.get_tool_credentials("calculator")
        assert creds == {"api_key": "test"}
    
    def test_get_tool_credentials_not_enabled(self):
        """Prueba obtener credenciales de tool no habilitada."""
        ctx = TenantContext(
            tenant_id="test",
            workflow_id="test",
            user_id="test",
            conversation_id="test",
            channel="dashboard",
            user_type="internal",
            timezone="UTC",
            agent_config={},
            model_configs={},
            enabled_tools=[],
            tool_configs={},
            credentials={"calculator": {"api_key": "test"}},
            enabled_functions={}
        )
        
        with pytest.raises(PermissionError):
            ctx.get_tool_credentials("calculator")
    
    def test_get_enabled_functions(self):
        """Prueba obtener funciones habilitadas."""
        ctx = TenantContext(
            tenant_id="test",
            workflow_id="test",
            user_id="test",
            conversation_id="test",
            channel="dashboard",
            user_type="internal",
            timezone="UTC",
            agent_config={},
            model_configs={},
            enabled_tools=["calculator"],
            tool_configs={},
            credentials={},
            enabled_functions={"calculator": ["calculator", "percentage"]}
        )
        
        functions = ctx.get_enabled_functions("calculator")
        assert "calculator" in functions
        assert "percentage" in functions
    
    def test_get_enabled_functions_all(self):
        """Prueba obtener todas las funciones (sin restricción)."""
        ctx = TenantContext(
            tenant_id="test",
            workflow_id="test",
            user_id="test",
            conversation_id="test",
            channel="dashboard",
            user_type="internal",
            timezone="UTC",
            agent_config={},
            model_configs={},
            enabled_tools=["calculator"],
            tool_configs={},
            credentials={},
            enabled_functions={}
        )
        
        functions = ctx.get_enabled_functions("calculator")
        assert functions is None  # Sin restricciones
