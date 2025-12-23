"""
TenantContext - Payload completo enviado por el Gateway.

ARQUITECTURA STATELESS:
- El Gateway construye este objeto con TODOS los datos necesarios
- Los Agents NO se conectan a DB, solo ejecutan con lo que reciben
- Gateway valida límites, permisos y carga configuraciones
- Agents procesa el request y retorna el resultado
- Múltiples conversaciones pueden procesarse en el mismo contenedor

Soporta dos tipos de usuarios:
- internal: Empleados de la organización (User model)
- external: Clientes/visitantes (EndUser model) - WhatsApp, web chat, API
"""

from dataclasses import dataclass, field
from typing import Any, Literal, ClassVar

# Tipos de usuario soportados
UserType = Literal['internal', 'external']


@dataclass
class TenantContext:
    """
    Payload completo que el Gateway envía a los Agents.
    
    TODO viene pre-cargado y pre-validado por el Gateway:
        - tenant_id, workflow_id: Identificación
        - conversation_id: ID de la conversación
        - user_type, user_id: Usuario que envía el mensaje
        - channel: Canal de origen (whatsapp, web, api, dashboard)
        - enabled_tools: Lista de tools habilitadas
        - agent_config: Configuración completa del grafo
        - model_configs: Configuración de modelos (default, classifier, etc)
        - credentials: Credenciales de tools desde Secret Manager
        - tool_configs: Configuración específica de cada tool para este tenant
        - message_history: Historial completo de mensajes de la conversación
        - user_metadata: Info adicional del usuario (source, name, phone, etc)
        - timezone: Zona horaria del workflow
    
    Ejemplo usuario interno (empleado en dashboard):
        ctx = TenantContext(
            tenant_id="org-123",
            workflow_id="asistente-rrhh",
            conversation_id="conv-456",
            user_type="internal",
            user_id="user-789",
            channel="dashboard",
            message_history=[...],
            ...
        )
    
    Ejemplo usuario externo (cliente en WhatsApp):
        ctx = TenantContext(
            tenant_id="org-123",
            workflow_id="atencion-cliente",
            conversation_id="conv-101",
            user_type="external",
            user_id="5212345678901",
            channel="whatsapp",
            user_metadata={"source": "whatsapp", "name": "Carlos"},
            message_history=[...],
            ...
        )
    """
    
    # ==========================================
    # Identificación (requeridos)
    # ==========================================  
    tenant_id: str          # ID de la Organization
    workflow_id: str        # ID del Workflow (qué agente usar)
    conversation_id: str    # ID de la conversación
    user_type: UserType     # "internal" o "external"
    user_id: str            # UUID (interno) o teléfono/session (externo)
    channel: str            # "dashboard", "whatsapp", "web", "api"
    
    # ==========================================
    # Configuración del Workflow (pre-cargada)
    # ==========================================
    # Tools habilitadas
    # Viene de: Workflow.tenantTools
    enabled_tools: list[str] = field(default_factory=list)
    
    # Configuración base del agente
    # Viene de: Workflow.config
    # Ejemplo: {"graph_type": "react", "system_prompt": "...", ...}
    agent_config: dict[str, Any] = field(default_factory=dict)
    
    # Configuración de modelos
    # Viene de: Workflow.config.models
    # Estructura: {"default": {model, systemPrompt, temperature...}, "classifier": {...}}
    model_configs: dict[str, Any] = field(default_factory=dict)
    
    # ==========================================
    # Credenciales y configuraciones de tools
    # ==========================================
    # Credenciales para cada tool (del Secret Manager vía Gateway)
    # Key = toolName del catálogo (NO el ID del TenantTool)
    # Ejemplo: {"google_calendar": {"token": "yyy"}, "hubspot": {"api_key": "xxx"}}
    # Si hay múltiples conexiones del mismo tipo, Gateway debe manejar el merge de credenciales
    credentials: dict[str, Any] = field(default_factory=dict)
    
    # Configuración específica de cada tool para este tenant
    # Viene de: TenantTools.config (agregado de todas las conexiones del mismo tipo)
    # Key = toolName del catálogo
    # Ejemplo: {"google_calendar": {"calendar_id": "primary"}, "hubspot": {"portal_id": "123"}}
    tool_configs: dict[str, Any] = field(default_factory=dict)
    
    # Control granular de funciones (MAPEADO por Gateway)
    # Key = toolName del catálogo (NO el ID del TenantTool)
    # Gateway hace el mapeo desde Workflow.toolPermissions (que usa IDs) a nombres
    # 
    # FLUJO DEL GATEWAY:
    # 1. Workflow.toolPermissions = {"tenant_tool_abc": ["func1"], "tenant_tool_def": ["func2"]}
    # 2. Gateway consulta TenantTool y obtiene ToolCatalog.toolName
    # 3. Gateway mapea a: {"google_calendar": ["func1", "func2"]} (merge si múltiples)
    # 4. Envía a Agents en este campo
    # 
    # Ejemplo: {"google_calendar": ["check_availability", "create_event"]}
    # 
    # Lógica de restricciones:
    # - Tool CON funciones: {"google_calendar": ["func1", "func2"]} → solo usa func1 y func2
    # - Tool SIN entrada: {} o tool no está en dict → sin restricciones, usa TODAS las funciones
    # - Tool con lista vacía: {"hubspot": []} → sin restricciones, usa TODAS las funciones
    enabled_functions: dict[str, list[str]] = field(default_factory=dict)
    
    # ==========================================
    # Historial y metadata
    # ==========================================
    # Historial completo de mensajes de la conversación
    # Viene de: Gateway lee de DB (Conversation.messages)
    # Estructura: [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]
    message_history: list[dict[str, Any]] = field(default_factory=list)
    
    # Info adicional del usuario
    # WhatsApp: {"source": "whatsapp", "phone": "+521234567890", "name": "Carlos"}
    # Web chat: {"source": "web_chat", "page": "/contacto", "session_id": "abc"}
    # API: {"source": "api", "customer_id": "cust-123"}
    user_metadata: dict[str, Any] = field(default_factory=dict)
    
    # Timezone del workflow (para timestamps y programación)
    timezone: str = "UTC"
    
    # ==========================================
    # Validación post-inicialización
    # ==========================================
    def __post_init__(self):
        """Valida que los datos requeridos estén presentes."""
        if not self.tenant_id:
            raise ValueError("tenant_id is required")
        if not self.workflow_id:
            raise ValueError("workflow_id is required")
        if not self.conversation_id:
            raise ValueError("conversation_id is required")
        if not self.user_id:
            raise ValueError("user_id is required")
        if not self.channel:
            raise ValueError("channel is required")
    
    # ==========================================
    # Deserialización
    # ==========================================
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "TenantContext":
        """
        Crea un TenantContext desde un diccionario (payload HTTP del Gateway).
        
        Ejemplo:
            payload = request.json()
            ctx = TenantContext.from_dict(payload)
        """
        return cls(**data)
    
    def to_dict(self) -> dict[str, Any]:
        """Convierte el contexto a diccionario."""
        return {
            "tenant_id": self.tenant_id,
            "workflow_id": self.workflow_id,
            "conversation_id": self.conversation_id,
            "user_type": self.user_type,
            "user_id": self.user_id,
            "channel": self.channel,
            "enabled_tools": self.enabled_tools,
            "agent_config": self.agent_config,
            "model_configs": self.model_configs,
            "credentials": self.credentials,
            "tool_configs": self.tool_configs,
            "enabled_functions": self.enabled_functions,
            "message_history": self.message_history,
            "user_metadata": self.user_metadata,
            "timezone": self.timezone,
        }
    
    # ==========================================
    # Propiedades calculadas
    # ==========================================
    @property
    def thread_id(self) -> str:
        """
        ID único y ESTABLE para esta conversación.
        
        Este ID es SIEMPRE el mismo para una conversación específica,
        sin importar qué contenedor de Agents procese el request.
        
        Usado para:
        - Logs y trazabilidad (correlacionar requests de la misma conversación)
        - LangGraph checkpointing temporal (si se usa Redis/PostgreSQL compartido)
        - Debugging en LangGraph Studio
        - Observabilidad y traces distribuidos
        
        Formato: "tenant:workflow:conversation"
        
        NOTA: No usar para checkpointing local (MemorySaver) porque causaría
              que requests de la misma conversación deban ir al mismo contenedor.
        """
        return f"{self.tenant_id}:{self.workflow_id}:{self.conversation_id}"
    
    @property
    def is_internal_user(self) -> bool:
        """True si es empleado de la organización (User model)."""
        return self.user_type == "internal"
    
    @property
    def is_external_user(self) -> bool:
        """True si es cliente/visitante externo (EndUser model)."""
        return self.user_type == "external"
    
    @property
    def source(self) -> str:
        """
        Fuente del usuario (whatsapp, web_chat, api, dashboard, etc).
        Equivalente a user_metadata["source"] con fallback a channel.
        """
        return self.user_metadata.get("source", self.channel)    
    
    @property
    def message_count(self) -> int:
        """Número de mensajes en el historial."""
        return len(self.message_history)
    
    # ==========================================
    # Métodos de acceso a tools
    # ==========================================
    def has_tool(self, tool_name: str) -> bool:
        """Verifica si una tool está habilitada para este workflow."""
        return tool_name in self.enabled_tools
    
    def get_tool_credentials(self, tool_name: str) -> dict[str, Any]:
        """
        Obtiene credenciales de una tool.
        
        Raises:
            PermissionError: Si la tool no está habilitada para este workflow
        """
        if not self.has_tool(tool_name):
            raise PermissionError(
                f"Tool '{tool_name}' is not enabled for workflow '{self.workflow_id}'"
            )
        return self.credentials.get(tool_name, {})
    
    def get_tool_config(self, tool_name: str) -> dict[str, Any]:
        """
        Obtiene configuración específica del tenant para una tool.
        
        Ejemplo: Para HubSpot retorna {"portal_id": "123", "pipeline": "ventas"}
        """
        return self.tool_configs.get(tool_name, {})
    
    def get_enabled_functions(self, tool_name: str) -> list[str] | None:
        """
        Obtiene las funciones habilitadas para una tool específica.
        
        Retorna:
            list[str]: Lista de nombres de funciones habilitadas para esta tool
            None: Sin restricciones - usar TODAS las funciones disponibles
        
        Lógica:
            - Si tool_name NO está en enabled_functions → None (sin restricciones)
            - Si tool_name está pero lista vacía → None (sin restricciones)
            - Si tool_name está con funciones → retornar lista
        
        Args:
            tool_name: Nombre de la tool ("google_calendar", "hubspot", etc)
        
        Returns:
            Lista de funciones permitidas o None para usar todas
            
        Example:
            # Con restricciones
            ctx.enabled_functions = {"google_calendar": ["check_availability", "create_event"]}
            functions = ctx.get_enabled_functions("google_calendar")
            # → ["check_availability", "create_event"]
            
            # Sin restricciones (tool no en dict)
            functions = ctx.get_enabled_functions("calculator")
            # → None (usar todas)
            
            # Sin restricciones (lista vacía)
            ctx.enabled_functions = {"hubspot": []}
            functions = ctx.get_enabled_functions("hubspot")
            # → None (usar todas)
        """
        if tool_name not in self.enabled_functions:
            return None
        
        functions = self.enabled_functions[tool_name]
        
        # Si la lista está vacía, interpretar como "sin restricciones"
        if not functions:
            return None
        
        return functions
    
    # ==========================================
    # Métodos de acceso a configuración
    # ==========================================
    def get_model_config(self, model_name: str = "default") -> dict[str, Any]:
        """
        Obtiene configuración de un modelo específico.
        
        Args:
            model_name: Nombre del modelo ("default", "classifier", etc)
        
        Returns:
            Configuración del modelo o dict vacío si no existe
        """
        return self.model_configs.get(model_name, {})
    
    # ==========================================
    # Métodos de acceso a user metadata
    # ==========================================
    def get_user_info(self, key: str, default: Any = None) -> Any:
        """
        Obtiene información del usuario desde metadata.
        
        Ejemplo:
            ctx.get_user_info("name")  # → "Carlos"
            ctx.get_user_info("phone") # → "+5212345678901"
        """
        return self.user_metadata.get(key, default)
    
    # ==========================================
    # Representación para debugging/logs
    # ==========================================
    def __repr__(self) -> str:
        return (
            f"TenantContext("
            f"tenant={self.tenant_id}, "
            f"workflow={self.workflow_id}, "
            f"conversation={self.conversation_id}, "
            f"user={self.user_type}:{self.user_id}, "
            f"channel={self.channel}, "
            f"tools={len(self.enabled_tools)}, "
            f"messages={len(self.message_history)}"
            f")"
        )