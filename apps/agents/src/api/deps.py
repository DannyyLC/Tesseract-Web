"""
Modelos Pydantic y funciones de validación/contexto para el servicio de agentes.
Sin dependencias de FastAPI — compatible con cualquier transporte (gRPC, HTTP, tests).
"""

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, ConfigDict
import logging

from core.context import TenantContext

logger = logging.getLogger(__name__)


class MessageRequest(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str
    model_config = ConfigDict(extra="allow")


class AgentExecutionRequest(BaseModel):
    tenant_id: str = Field(..., description="ID de la Organization")
    workflow_id: str = Field(..., description="ID del Workflow")
    conversation_id: str = Field(..., description="ID de la conversación")
    user_type: Literal["internal", "external"] = Field(..., description="Tipo de usuario")
    user_id: str = Field(..., description="ID del usuario")
    channel: str = Field(..., description="Canal de origen")
    user_message: str = Field(..., description="Mensaje actual del usuario")
    graph_config: dict[str, Any] = Field(default_factory=dict)
    agents_config: dict[str, Any] = Field(default_factory=dict)
    agent_tool_instances: dict[str, dict[str, Any]] = Field(default_factory=dict)
    message_history: list[dict[str, Any]] = Field(default_factory=list)
    user_metadata: dict[str, Any] = Field(default_factory=dict)
    timezone: str = Field(default="UTC")
    interrupts: Optional[list[str]] = Field(default=None)


class AgentExecutionResponse(BaseModel):
    conversation_id: str
    messages: list[dict[str, Any]]
    metadata: Optional[dict[str, Any]] = None


def validate_request(request: AgentExecutionRequest) -> AgentExecutionRequest:
    graph_type = request.graph_config.get("type")
    if not graph_type:
        raise ValueError("graph_config must include 'type'")

    if not request.agents_config:
        raise ValueError("agents_config is required")

    if request.user_type not in ("internal", "external"):
        raise ValueError(f"Invalid user_type: {request.user_type}")

    logger.info(
        f"Request validated: tenant={request.tenant_id}, "
        f"workflow={request.workflow_id}, conversation={request.conversation_id}, "
        f"graph_type={graph_type}"
    )
    return request


def build_context(request: AgentExecutionRequest, streaming: bool = False) -> TenantContext:
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
            streaming=streaming,
        )
        logger.debug(f"TenantContext built for conversation {request.conversation_id}")
        return ctx
    except Exception as e:
        logger.error(f"Failed to build TenantContext: {e}", exc_info=True)
        raise RuntimeError(f"Failed to build execution context: {e}") from e
