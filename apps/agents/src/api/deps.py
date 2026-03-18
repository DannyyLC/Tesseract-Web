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
    role: Literal["user", "assistant", "system"]
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
    graph_config: dict[str, Any] = Field(
        default_factory=dict,
        description="Config del grafo: {type: 'react', config: {max_iterations: 10, allow_interrupts: false}}"
    )
    
    agents_config: dict[str, Any] = Field(
        default_factory=dict,
        description="Configs por agente: {default: {model, temperature, system_prompt, tools: [uuids]}}"
    )
    
    agent_tool_instances: dict[str, dict[str, Any]] = Field(
        default_factory=dict,
        description=(
            "Tool instances por agente. "
            "Estructura: {agent_name: {tool_uuid: {tool_name, display_name, credentials, config, enabled_functions}}}"
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
                "graph_config": {
                    "type": "react",
                    "config": {
                        "max_iterations": 10,
                        "allow_interrupts": True
                    }
                },
                "agents_config": {
                    "default": {
                        "model": "gpt-4o",
                        "temperature": 0.7,
                        "system_prompt": "Eres un asistente de ventas...",
                        "tools": ["tool-uuid-1", "tool-uuid-2"]
                    }
                },
                "agent_tool_instances": {
                    "default": {
                        "tool-uuid-1": {
                            "tool_name": "google_calendar",
                            "display_name": "Calendar Ventas",
                            "credentials": {"token": "xxx"},
                            "config": {"calendar_id": "primary"},
                            "enabled_functions": ["check_availability", "create_event"]
                        },
                        "tool-uuid-2": {
                            "tool_name": "hubspot",
                            "display_name": "HubSpot CRM",
                            "credentials": {"api_key": "yyy"},
                            "config": {"portal_id": "12345678"},
                            "enabled_functions": ["create_contact", "search_deals"]
                        }
                    }
                },
                "message_history": [
                    {"role": "user", "content": "Hola"},
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
                    "model_used": "gpt-4o",
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
    
    # Validar que graph_type esté configurado en graph_config
    graph_type = request.graph_config.get("type")
    if not graph_type:
        logger.error(f"Missing 'type' in graph_config for workflow {request.workflow_id}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="graph_config must include 'type'"
        )
    
    # Validar que haya al menos un agente configurado
    if not request.agents_config:
        logger.error(f"No agents_config provided for workflow {request.workflow_id}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="agents_config is required"
        )
    
    # Validar user_type
    if request.user_type not in ["internal", "external"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid user_type: {request.user_type}. Must be 'internal' or 'external'"
        )
    
    logger.info(
        f"Request validated: tenant={request.tenant_id}, "
        f"workflow={request.workflow_id}, "
        f"conversation={request.conversation_id}, "
        f"graph_type={graph_type}"
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
            graph_config=request.graph_config,
            agents_config=request.agents_config,
            agent_tool_instances=request.agent_tool_instances,
            message_history=request.message_history,
            user_metadata=request.user_metadata,
            timezone=request.timezone,
            streaming=streaming 
        )
        
        logger.debug(f"TenantContext built successfully for conversation {request.conversation_id}")
        return ctx
        
    except Exception as e:
        logger.error(f"Failed to build TenantContext: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to build execution context: {str(e)}"
        )
