"""
TenantContext - El "pasaporte" de cada petición.

Este objeto tiene dos fases:
1. CREACIÓN: Se llena con datos del request (tenant_id, workflow_id, user)
2. CARGA: El TenantService llena el resto desde la DB (tools, credentials, config)

Soporta dos tipos de usuarios:
- internal: Empleados de la organización
- external: Clientes/visitantes (WhatsApp, web chat, API externa)
"""

from dataclasses import dataclass, field
from typing import Any, Literal

# Tipos de usuario soportados
UserType = Literal['internal', 'external']


@dataclass
class TenantContext:
    """
    Contexto de ejecución para cada petición.
    
    FASE 1 - Viene del request:
        - tenant_id: Qué empresa
        - workflow_id: Qué agente usar
        - user_type: Interno o externo
        - user_id: Identificador del usuario
        - user_metadata: Info adicional (source, name, etc.)
    
    FASE 2 - Se carga de la DB (TenantService):
        - enabled_tools: Del Workflow
        - agent_config: Del Workflow  
        - credentials: Del TenantTools + Secret Manager
        - tool_configs: Del TenantTools
    
    Ejemplo usuario interno (empleado en dashboard):
        ctx = TenantContext(
            tenant_id="org-123",
            workflow_id="asistente-rrhh",
            user_type="internal",
            user_id="user-456",
        )
    
    Ejemplo usuario externo (cliente en WhatsApp):
        ctx = TenantContext(
            tenant_id="org-123",
            workflow_id="atencion-cliente",
            user_type="external",
            user_id="5212345678901",
            user_metadata={"source": "whatsapp", "name": "Carlos"}
        )
    """
    
    # ==========================================
    # FASE 1: Datos del request (requeridos)
    # ==========================================  
    tenant_id: str          # ID de la Organization
    workflow_id: str        # ID del Workflow (qué agente usar)
    user_type: UserType     # "internal" o "external"
    user_id: str            # UUID (interno) o teléfono/session (externo)
    conversation_id: str | None = None # ID de la conversación específica
    
    # Info adicional del usuario externo (opcional)
    # WhatsApp: {"source": "whatsapp", "phone": "+521234567890", "name": "Carlos"}
    # Web chat: {"source": "web_chat", "page": "/contacto", "session_id": "abc"}
    # API: {"source": "api", "customer_id": "cust-123"}
    user_metadata: dict[str, Any] = field(default_factory=dict)
    
    # ==========================================
    # FASE 2: Datos cargados de la DB
    # ==========================================
    # Tools habilitadas para este Workflow
    # Viene de: Workflow.enabledTools
    enabled_tools: list[str] = field(default_factory=list)
    # Configuración del agente
    # Viene de: Workflow.config
    # Ejemplo: {"graph_type": "react", "model": "gpt-4o", "system_prompt": "..."}
    agent_config: dict[str, Any] = field(default_factory=dict) 
    # Credenciales para cada tool (del Secret Manager)
    # Viene de: TenantTools.credentialPath → Secret Manager
    # Ejemplo: {"hubspot": {"api_key": "xxx"}, "google_calendar": {"token": "yyy"}}
    credentials: dict[str, Any] = field(default_factory=dict)
    # Configuración específica de cada tool para este tenant
    # Viene de: TenantTools.config
    # Ejemplo: {"hubspot": {"portal_id": "123", "pipeline": "ventas"}}
    tool_configs: dict[str, Any] = field(default_factory=dict)
    
    # ==========================================
    # Propiedades calculadas
    # ==========================================
    @property
    def thread_id(self) -> str:
        """
        ID único para el historial de conversación en LangGraph.
        
        Formato: "tenant:user:workflow:conversation"
        """
        if not self.conversation_id:
            raise ValueError(
                "conversation_id must be set before accessing thread_id"
            )
        
        return f"{self.tenant_id}:{self.user_id}:{self.workflow_id}:{self.conversation_id}"
    @property
    def is_new_conversation(self) -> bool:
        """True si es una conversación nueva (sin ID asignado aún)."""
        return self.conversation_id is None
    @property
    def is_internal_user(self) -> bool:
        """True si es empleado de la organización."""
        return self.user_type == "internal"
    @property
    def is_external_user(self) -> bool:
        """True si es cliente/visitante externo."""
        return self.user_type == "external"
    @property
    def is_loaded(self) -> bool:
        """
        True si el contexto ya fue cargado con datos de la DB.
        """
        return len(self.enabled_tools) > 0 or len(self.agent_config) > 0
    @property
    def source(self) -> str:
        """Fuente del usuario (whatsapp, web_chat, api, dashboard, etc)."""
        return self.user_metadata.get("source", "unknown")
    
    # ==========================================
    # Métodos de acceso a tools
    # ==========================================
    def has_tool(self, tool_name: str) -> bool:
        """Verifica si el workflow puede usar esta tool."""
        return tool_name in self.enabled_tools
    def get_tool_credentials(self, tool_name: str) -> dict[str, Any]:
        """
        Obtiene credenciales de una tool.
        
        Raises:
            PermissionError: Si la tool no está habilitada
        """
        if not self.has_tool(tool_name):
            raise PermissionError(
                f"Tool '{tool_name}' is not enabled for this workflow"
            )
        return self.credentials.get(tool_name, {})
    def get_tool_config(self, tool_name: str) -> dict[str, Any]:
        """Obtiene configuración específica del tenant para una tool."""
        return self.tool_configs.get(tool_name, {})
    
    # ==========================================
    # Método de acceso a user metadata
    # ==========================================
    def get_user_info(self, key: str, default: Any = None) -> Any:
        """Obtiene info del usuario desde metadata."""
        return self.user_metadata.get(key, default)
    
    # ==========================================
    # Representación para debugging/logs
    # ==========================================
    def __repr__(self) -> str:
        return (
            f"TenantContext("
            f"tenant={self.tenant_id}, "
            f"workflow={self.workflow_id}, "
            f"user={self.user_type}:{self.user_id}, "
            f"conversation={self.conversation_id or 'NEW'}, "
            f"tools={self.enabled_tools}, "
            f"loaded={self.is_loaded}"
            f")"
        )