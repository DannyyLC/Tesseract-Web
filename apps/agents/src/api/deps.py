"""
API Dependencies - Validación y construcción de TenantContext.

Este módulo contiene:
1. Modelos Pydantic para validar requests
2. Funciones dependency para FastAPI
3. Construcción de TenantContext desde el request

FLUJO:
    Gateway envía JSON → Pydantic valida → build_context() crea TenantContext
"""

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, ConfigDict
from fastapi import HTTPException, status
import logging

from core.context import TenantContext

logger = logging.getLogger(__name__)


# ==========================================
# Pydantic Models para Validación
# ==========================================
class MessageRequest(BaseModel):
    """Modelo para un mensaje en el historial."""
    role: Literal["human", "assistant", "system"]
    content: str
    
    model_config = ConfigDict(extra="allow")  # Permite campos adicionales


class AgentExecutionRequest(BaseModel):
    """
    Request completo para ejecutar un agente.
    
    Este es el payload que el Gateway envía.
    Contiene TODA la información necesaria para ejecutar el agente.
    """
    
    # ==========================================
    # Identificación (requeridos)
    # ==========================================
    tenant_id: str = Field(..., description="ID de la Organization")
    workflow_id: str = Field(..., description="ID del Workflow")
    conversation_id: str = Field(..., description="ID de la conversación")
    user_type: Literal["internal", "external"] = Field(..., description="Tipo de usuario")
    user_id: str = Field(..., description="ID del usuario (UUID o teléfono)")
    channel: str = Field(..., description="Canal de origen (dashboard, whatsapp, web, api)")
    
    # ==========================================
    # Mensaje actual del usuario
    # ==========================================
    user_message: str = Field(..., description="Mensaje actual enviado por el usuario")
    
    # ==========================================
    # Configuración del Workflow
    # ==========================================
    enabled_tools: list[str] = Field(
        default_factory=list,
        description="Lista de tools habilitadas para este workflow"
    )
    
    agent_config: dict[str, Any] = Field(
        default_factory=dict,
        description="Configuración del agente (graph_type, system_prompt, etc)"
    )
    
    model_configs: dict[str, Any] = Field(
        default_factory=dict,
        description="Configuración de modelos (default, classifier, etc)"
    )
    
    # ==========================================
    # Credenciales y configuraciones
    # ==========================================
    credentials: dict[str, dict[str, Any]] = Field(
        default_factory=dict,
        description="Credenciales de tools desde Secret Manager. Key = toolName del catálogo"
    )
    
    tool_configs: dict[str, dict[str, Any]] = Field(
        default_factory=dict,
        description="Configuración específica de cada tool para este tenant. Key = toolName del catálogo"
    )
    
    enabled_functions: dict[str, list[str]] = Field(
        default_factory=dict,
        description=(
            "Control granular de funciones por tool (mapeado por Gateway). "
            "Key = toolName del catálogo. "
            "Ejemplo: {'google_calendar': ['check_availability', 'create_event']}. "
            "Tool CON funciones → solo usa las especificadas. "
            "Tool SIN entrada o lista vacía → usa TODAS las funciones disponibles."
        )
    )
    
    # ==========================================
    # Historial y contexto
    # ==========================================
    message_history: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Historial completo de mensajes de la conversación"
    )
    
    user_metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Metadata del usuario (source, name, phone, etc)"
    )
    
    # ==========================================
    # Configuración adicional
    # ==========================================
    timezone: str = Field(
        default="UTC",
        description="Zona horaria del workflow (para timestamps y programación)"
    )
    
    interrupts: Optional[list[str]] = Field(
        default=None,
        description="Puntos de interrupción en el grafo (para aprobaciones)"
    )
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "tenant_id": "org-123",
                "workflow_id": "asistente-ventas",
                "conversation_id": "conv-456",
                "user_type": "internal",
                "user_id": "user-789",
                "channel": "dashboard",
                "user_message": "Agenda una demo para mañana",
                "enabled_tools": ["google_calendar", "hubspot"],
                "agent_config": {
                    "graph_type": "react",
                    "system_prompt": "Eres un asistente de ventas...",
                    "max_iterations": 10
                },
                "model_configs": {
                    "default": {
                        "model": "gpt-4o",
                        "temperature": 0.7
                    }
                },
                "credentials": {
                    "google_calendar": {
                        "access_token": "ya29.xxx",
                        "refresh_token": "1//xxx"
                    },
                    "hubspot": {
                        "api_key": "pat-na1-xxx"
                    }
                },
                "tool_configs": {
                    "google_calendar": {
                        "calendar_id": "primary",
                        "timezone": "America/Mexico_City"
                    },
                    "hubspot": {
                        "portal_id": "12345678"
                    }
                },
                "enabled_functions": {
                    "google_calendar": ["check_availability", "create_event"],
                    "hubspot": []
                },
                "message_history": [
                    {"role": "human", "content": "Hola"},
                    {"role": "assistant", "content": "¡Hola! ¿Cómo puedo ayudarte?"}
                ],
                "user_metadata": {
                    "name": "Juan Pérez",
                    "email": "juan@empresa.com"
                },
                "timezone": "America/Mexico_City"
            }
        }
    )


class AgentExecutionResponse(BaseModel):
    """Response de la ejecución del agente."""
    
    conversation_id: str
    messages: list[dict[str, Any]]
    metadata: Optional[dict[str, Any]] = None
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "conversation_id": "conv-456",
                "messages": [
                    {
                        "role": "assistant",
                        "content": "He agendado la demo para mañana a las 3pm"
                    }
                ],
                "metadata": {
                    "execution_time_ms": 1250,
                    "tools_called": ["google_calendar"],
                    "model_used": "gpt-4o"
                }
            }
        }
    )


class StreamEvent(BaseModel):
    """Modelo para eventos de streaming."""
    
    type: Literal["token", "message", "tool_start", "tool_end", "error", "end"]
    content: str
    metadata: Optional[dict[str, Any]] = None
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "type": "token",
                "content": "Hola",
                "metadata": {"model": "gpt-4o"}
            }
        }
    )


# ==========================================
# Dependency Functions
# ==========================================

def validate_request(request: AgentExecutionRequest) -> AgentExecutionRequest:
    """
    Valida el request antes de procesarlo.
    
    Pydantic ya hace validación básica, pero aquí podemos
    agregar validaciones de negocio adicionales.
    
    Args:
        request: Request validado por Pydantic
    
    Returns:
        Request validado
        
    Raises:
        HTTPException: Si hay errores de validación de negocio
    """
    
    # Validar que graph_type esté configurado
    graph_type = request.agent_config.get("graph_type")
    if not graph_type:
        logger.error(f"Missing graph_type in agent_config for workflow {request.workflow_id}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="agent_config must include 'graph_type'"
        )
    
    # Validar que haya configuración de modelo
    if not request.model_configs:
        logger.warning(f"No model_configs provided for workflow {request.workflow_id}, using defaults")
    
    # Validar user_type
    if request.user_type not in ["internal", "external"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid user_type: {request.user_type}. Must be 'internal' or 'external'"
        )
    
    logger.info(
        f"Request validated: tenant={request.tenant_id}, "
        f"workflow={request.workflow_id}, "
        f"conversation={request.conversation_id}"
    )
    
    return request


def build_context(request: AgentExecutionRequest, streaming: bool = False) -> TenantContext:
    """
    Construye TenantContext desde el request.
    
    Convierte el request validado de Pydantic en un TenantContext
    que el agent_factory puede usar.
    
    Args:
        request: Request validado
        streaming: Si se debe habilitar streaming de tokens (default: False)
    
    Returns:
        TenantContext listo para ejecutar el agente
    """
    
    try:
        ctx = TenantContext(
            tenant_id=request.tenant_id,
            workflow_id=request.workflow_id,
            conversation_id=request.conversation_id,
            user_type=request.user_type,
            user_id=request.user_id,
            channel=request.channel,
            enabled_tools=request.enabled_tools,
            agent_config=request.agent_config,
            model_configs=request.model_configs,
            credentials=request.credentials,
            tool_configs=request.tool_configs,
            enabled_functions=request.enabled_functions,
            message_history=request.message_history,
            user_metadata=request.user_metadata,
            timezone=request.timezone,
            streaming=streaming  # Pasar el flag de streaming
        )
        
        logger.debug(f"TenantContext built successfully for conversation {request.conversation_id}")
        return ctx
        
    except Exception as e:
        logger.error(f"Failed to build TenantContext: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to build execution context: {str(e)}"
        )
