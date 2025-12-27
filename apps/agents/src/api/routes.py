"""
API Routes - Endpoints para ejecutar agentes.

Este módulo contiene los endpoints HTTP que el Gateway llama
para ejecutar agentes de LangGraph.

ENDPOINTS:
- POST /agents/execute - Ejecutar un agente y retornar respuesta completa
"""

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage
import logging
import time
import json

from api.deps import (
    AgentExecutionRequest,
    AgentExecutionResponse,
    validate_request,
    build_context
)
from core.agent_factory import create_agent_graph

logger = logging.getLogger(__name__)

# ==========================================
# Router
# ==========================================
router = APIRouter()


# ==========================================
# Helper Functions
# ==========================================
def convert_message_history_to_langchain(history: list[dict]) -> list:
    """
    Convierte el historial de mensajes a formato LangChain.
    
    Args:
        history: Lista de mensajes en formato dict
                 [{"role": "human", "content": "..."}, ...]
    
    Returns:
        Lista de mensajes LangChain [HumanMessage(...), AIMessage(...), ...]
    """
    langchain_messages = []
    
    for msg in history:
        role = msg.get("role", "").lower()
        content = msg.get("content", "")
        
        if role == "human" or role == "user":
            langchain_messages.append(HumanMessage(content=content))
        elif role == "assistant" or role == "ai":
            langchain_messages.append(AIMessage(content=content))
        elif role == "system":
            langchain_messages.append(SystemMessage(content=content))
        else:
            logger.warning(f"Unknown message role: {role}, treating as human")
            langchain_messages.append(HumanMessage(content=content))
    
    return langchain_messages

def convert_langchain_messages_to_dict(messages: list) -> list[dict]:
    """
    Convierte mensajes LangChain a formato dict para el response.
    
    FILTRADO:
    - SystemMessage: No se incluye (es configuración, no conversación)
    - ToolMessage: No se incluye (son detalles técnicos internos)
    - AIMessage vacío: No se incluye (son tool calls intermedios)
    
    Solo se retornan mensajes relevantes para el usuario final:
    - HumanMessage: Mensajes del usuario
    - AIMessage con contenido: Respuestas del asistente
    
    Args:
        messages: Lista de mensajes LangChain
    
    Returns:
        Lista de dicts [{"role": "assistant", "content": "..."}, ...]
    """
    result = []
    
    for msg in messages:
        msg_type = type(msg).__name__
        
        # Filtrar SystemMessage (configuración del agente)
        if msg_type == "SystemMessage":
            continue
        
        # Filtrar ToolMessage (detalles técnicos internos)
        if msg_type == "ToolMessage":
            continue
        
        # Mapear tipos de mensaje a roles
        if msg_type == "HumanMessage":
            role = "human"
            content = msg.content if hasattr(msg, 'content') else str(msg)
        elif msg_type == "AIMessage":
            role = "assistant"
            content = msg.content if hasattr(msg, 'content') else str(msg)
            
            # Filtrar AIMessage vacíos (tool calls intermedios)
            if not content or content.strip() == "":
                continue
        else:
            role = "unknown"
            content = msg.content if hasattr(msg, 'content') else str(msg)
            logger.warning(f"Unknown message type in response: {msg_type}")
        
        result.append({
            "role": role,
            "content": content
        })
    
    return result

async def stream_agent_execution(graph, messages: list, conversation_id: str):
    """
    Ejecuta el agente en modo streaming y genera eventos SSE.
    
    Utiliza astream_events de LangGraph para capturar tokens en tiempo real
    y eventos de herramientas.
    
    Args:
        graph: Grafo compilado de LangGraph
        messages: Lista de mensajes LangChain preparados
        conversation_id: ID de la conversación para logging
    
    Yields:
        Strings formateados como Server-Sent Events (SSE)
    """
    try:
        logger.info(f"[{conversation_id}] Starting streaming execution...")
        
        # Usar astream_events para capturar todos los eventos del grafo
        async for event in graph.astream_events(
            {"messages": messages, "iteration_count": 0},
            version="v1"
        ):
            event_type = event.get("event", "")
            
            # ==========================================
            # Tokens del modelo (streaming de respuesta)
            # ==========================================
            if event_type == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    stream_event = {
                        "type": "token",
                        "content": chunk.content
                    }
                    yield f"data: {json.dumps(stream_event)}\n\n"
            
            # ==========================================
            # Inicio de llamada a tool
            # ==========================================
            elif event_type == "on_tool_start":
                tool_name = event.get("name", "unknown")
                tool_input = event.get("data", {}).get("input", {})
                
                stream_event = {
                    "type": "tool_start",
                    "content": f"Usando herramienta: {tool_name}",
                    "metadata": {
                        "tool_name": tool_name,
                        "input": str(tool_input)[:200]  # Limitar tamaño
                    }
                }
                yield f"data: {json.dumps(stream_event)}\n\n"
                logger.debug(f"[{conversation_id}] Tool started: {tool_name}")
            
            # ==========================================
            # Fin de llamada a tool
            # ==========================================
            elif event_type == "on_tool_end":
                tool_name = event.get("name", "unknown")
                tool_output = event.get("data", {}).get("output", "")
                
                stream_event = {
                    "type": "tool_end",
                    "content": f"Herramienta completada: {tool_name}",
                    "metadata": {
                        "tool_name": tool_name,
                        "output": str(tool_output)[:200]  # Limitar tamaño
                    }
                }
                yield f"data: {json.dumps(stream_event)}\n\n"
                logger.debug(f"[{conversation_id}] Tool ended: {tool_name}")
            
            # ==========================================
            # Mensaje completo del modelo
            # ==========================================
            elif event_type == "on_chat_model_end":
                output = event.get("data", {}).get("output")
                if output and hasattr(output, "content") and output.content:
                    stream_event = {
                        "type": "message",
                        "content": output.content
                    }
                    yield f"data: {json.dumps(stream_event)}\n\n"
        
        # ==========================================
        # Evento final
        # ==========================================
        stream_event = {
            "type": "end",
            "content": ""
        }
        yield f"data: {json.dumps(stream_event)}\n\n"
        
        logger.info(f"[{conversation_id}] Streaming execution completed")
        
    except Exception as e:
        logger.error(f"[{conversation_id}] Streaming error: {str(e)}", exc_info=True)
        stream_event = {
            "type": "error",
            "content": str(e)
        }
        yield f"data: {json.dumps(stream_event)}\n\n"


# ==========================================
# Endpoints
# ==========================================
@router.post(
    "/agents/execute",
    response_model=AgentExecutionResponse,
    summary="Ejecutar un agente",
    description="""
    Ejecuta un agente de LangGraph con la configuración proporcionada.
    
    El Gateway debe enviar un TenantContext completo con:
    - Identificación (tenant_id, workflow_id, conversation_id)
    - Configuración del agente (graph_type, system_prompt, tools)
    - Credenciales de tools
    - Historial de mensajes
    - Mensaje actual del usuario
    
    Retorna la respuesta del agente con los mensajes generados.
    """
)
async def execute_agent(request: AgentExecutionRequest) -> AgentExecutionResponse:
    """
    Ejecuta un agente y retorna la respuesta completa.
    
    Args:
        request: Request validado con toda la configuración
    
    Returns:
        Response con los mensajes generados por el agente
        
    Raises:
        HTTPException: Si hay errores en la ejecución
    """
    start_time = time.time()
    
    try:
        # ==========================================
        # 1. Validar request
        # ==========================================
        logger.info(
            f"[{request.conversation_id}] Received execution request: "
            f"tenant={request.tenant_id}, workflow={request.workflow_id}, "
            f"user_type={request.user_type}"
        )
        
        validated_request = validate_request(request)
        
        # ==========================================
        # 2. Construir TenantContext
        # ==========================================
        ctx = build_context(validated_request)
        
        logger.info(
            f"[{request.conversation_id}] Context built: "
            f"graph_type={ctx.agent_config.get('graph_type')}, "
            f"tools={len(ctx.enabled_tools)}, "
            f"history_messages={len(ctx.message_history)}"
        )
        
        # ==========================================
        # 3. Crear el grafo del agente
        # ==========================================
        try:
            graph = create_agent_graph(ctx)
            logger.info(f"[{request.conversation_id}] Agent graph created successfully")
        except Exception as e:
            logger.error(f"[{request.conversation_id}] Failed to create agent graph: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create agent graph: {str(e)}"
            )
        
        # ==========================================
        # 4. Preparar mensajes para el grafo
        # ==========================================
        # Convertir historial a formato LangChain
        messages = convert_message_history_to_langchain(request.message_history)
        
        # Agregar el mensaje actual del usuario
        messages.append(HumanMessage(content=request.user_message))
        
        logger.info(
            f"[{request.conversation_id}] Prepared {len(messages)} messages for execution"
        )
        
        # ==========================================
        # 5. Ejecutar el grafo
        # ==========================================
        try:
            logger.info(f"[{request.conversation_id}] Starting agent execution...")
            
            result = graph.invoke({
                "messages": messages,
                "iteration_count": 0
            })
            
            execution_time = (time.time() - start_time) * 1000  # ms
            
            logger.info(
                f"[{request.conversation_id}] Agent execution completed in {execution_time:.0f}ms"
            )
            
        except Exception as e:
            logger.error(
                f"[{request.conversation_id}] Agent execution failed: {str(e)}", 
                exc_info=True
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Agent execution failed: {str(e)}"
            )
        
        # ==========================================
        # 6. Procesar resultado
        # ==========================================
        output_messages = result.get("messages", [])
        
        # Convertir mensajes LangChain a dict
        response_messages = convert_langchain_messages_to_dict(output_messages)
        
        # Metadata de la ejecución
        metadata = {
            "execution_time_ms": int(execution_time),
            "graph_type": ctx.agent_config.get("graph_type"),
            "model_used": ctx.model_configs.get("default", {}).get("model", "unknown"),
            "tools_enabled": ctx.enabled_tools,
            "total_messages": len(response_messages)
        }
        
        logger.info(
            f"[{request.conversation_id}] Returning {len(response_messages)} messages"
        )
        
        # ==========================================
        # 7. Retornar respuesta
        # ==========================================
        return AgentExecutionResponse(
            conversation_id=request.conversation_id,
            messages=response_messages,
            metadata=metadata
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions (ya tienen el formato correcto)
        raise
        
    except Exception as e:
        # Capturar cualquier otro error no manejado
        execution_time = (time.time() - start_time) * 1000
        logger.error(
            f"[{request.conversation_id}] Unexpected error after {execution_time:.0f}ms: {str(e)}",
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error during agent execution: {str(e)}"
        )


# ==========================================
# Endpoint de Streaming
# ==========================================
@router.post(
    "/agents/execute/stream",
    summary="Ejecutar agente con streaming",
    description="""
    Ejecuta un agente de LangGraph con streaming de tokens en tiempo real.
    
    Retorna eventos Server-Sent Events (SSE) con:
    - Tokens individuales mientras el modelo genera la respuesta
    - Inicio y fin de llamadas a herramientas
    - Mensajes completos
    - Errores si ocurren
    
    Formato de eventos SSE:
    ```
    data: {"type": "token", "content": "Hola"}
    data: {"type": "tool_start", "content": "Usando herramienta: google_calendar"}
    data: {"type": "tool_end", "content": "Herramienta completada: google_calendar"}
    data: {"type": "message", "content": "He agendado tu reunión"}
    data: {"type": "end", "content": ""}
    ```
    """
)
async def execute_agent_stream(request: AgentExecutionRequest):
    """
    Ejecuta un agente con streaming de tokens en tiempo real.
    
    Args:
        request: Request validado con toda la configuración
    
    Returns:
        StreamingResponse con eventos SSE
        
    Raises:
        HTTPException: Si hay errores en la configuración
    """
    try:
        # ==========================================
        # 1. Validar request
        # ==========================================
        logger.info(
            f"[{request.conversation_id}] Received streaming request: "
            f"tenant={request.tenant_id}, workflow={request.workflow_id}"
        )
        
        validated_request = validate_request(request)
        
        # ==========================================
        # 2. Construir TenantContext con streaming habilitado
        # ==========================================
        ctx = build_context(validated_request, streaming=True)
        
        # ==========================================
        # 3. Crear el grafo del agente
        # ==========================================
        try:
            graph = create_agent_graph(ctx)
            logger.info(f"[{request.conversation_id}] Agent graph created for streaming")
        except Exception as e:
            logger.error(f"[{request.conversation_id}] Failed to create agent graph: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create agent graph: {str(e)}"
            )
        
        # ==========================================
        # 4. Preparar mensajes para el grafo
        # ==========================================
        messages = convert_message_history_to_langchain(request.message_history)
        messages.append(HumanMessage(content=request.user_message))
        
        logger.info(
            f"[{request.conversation_id}] Prepared {len(messages)} messages for streaming"
        )
        
        # ==========================================
        # 5. Retornar StreamingResponse
        # ==========================================
        return StreamingResponse(
            stream_agent_execution(graph, messages, request.conversation_id),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # Deshabilitar buffering en nginx
            }
        )
        
    except HTTPException:
        raise
        
    except Exception as e:
        logger.error(
            f"[{request.conversation_id}] Unexpected error in streaming setup: {str(e)}",
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error during streaming setup: {str(e)}"
        )


# ==========================================
# Endpoint de Validación (útil para testing)
# ==========================================
@router.post(
    "/agents/validate",
    summary="Validar configuración de agente",
    description="""
    Valida que la configuración de un agente sea correcta sin ejecutarlo.
    
    Útil para:
    - Testing de configuraciones
    - Validación antes de guardar un workflow
    - Debug de problemas de configuración
    """
)
async def validate_agent_config(request: AgentExecutionRequest) -> dict:
    """
    Valida la configuración sin ejecutar el agente.
    
    Args:
        request: Request con la configuración a validar
    
    Returns:
        Dict con el resultado de la validación
    """
    try:
        # Validar request
        validated_request = validate_request(request)
        
        # Construir context
        ctx = build_context(validated_request)
        
        # Intentar crear el grafo (sin ejecutarlo)
        graph = create_agent_graph(ctx)
        
        return {
            "valid": True,
            "message": "Configuration is valid",
            "details": {
                "graph_type": ctx.agent_config.get("graph_type"),
                "tools_count": len(ctx.enabled_tools),
                "model_configured": "default" in ctx.model_configs
            }
        }
        
    except HTTPException as e:
        return {
            "valid": False,
            "message": "Validation failed",
            "error": e.detail
        }
        
    except Exception as e:
        return {
            "valid": False,
            "message": "Validation failed",
            "error": str(e)
        }
