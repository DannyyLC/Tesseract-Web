"""
ReAct Agent - Reasoning + Acting

PATRÓN REACT:
1. LLM razona sobre qué hacer (Reasoning)
2. LLM decide si necesita llamar una tool o responder
3. Si llama tool → ejecuta → vuelve a LLM con resultado (Acting)
4. Si responde al usuario → termina

CASOS DE USO:
- Asistente general que necesita acceso a tools
- Agente de soporte que consulta CRM (HubSpot, Zendesk)
- Bot que agenda citas y verifica disponibilidad
- Asistente que busca información y responde
- Cualquier agente que necesite razonar + actuar

CONFIGURACIÓN ESPERADA:
{
    "graph_type": "react",
    "system_prompt": "Eres un asistente que...",
    "max_iterations": 10,
    "interrupts": ["before_tools"],  # Opcional: pausar antes de ejecutar tools
    "models": {
        "default": {
            "model": "gpt-4o",
            "temperature": 0.7,
            "enabledFeatures": ["vision", "web_search"]
        }
    }
}
"""

from typing import Annotated, Literal, TypedDict
from langgraph.graph import StateGraph, END, START
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
import logging

from core.context import TenantContext
from tools.registry import load_tools, get_llm

# ==========================================
# Logger
# ==========================================
logger = logging.getLogger(__name__)


# ==========================================
# Estado del Grafo
# ==========================================
class ReactAgentState(TypedDict):
    """
    Estado que fluye por el grafo.
    
    LangGraph pasa este diccionario entre nodos.
    Cada nodo puede leer y modificar el estado.
    
    Campos:
        messages: Lista de mensajes de la conversación
                  LangGraph automáticamente concatena mensajes
                  gracias al reducer add_messages
        
        iteration_count: Contador de iteraciones para evitar loops infinitos
                        Se incrementa cada vez que el LLM decide llamar una tool
    """
    # Annotated[type, reducer_function]
    # add_messages: Función que concatena nuevos mensajes a la lista
    messages: Annotated[list, add_messages]
    
    # Contador simple sin reducer (se sobreescribe)
    iteration_count: int


# ==========================================
# Nodos del Grafo
# ==========================================
def call_model(state: ReactAgentState, ctx: TenantContext) -> dict:
    """
    Nodo que llama al LLM.
    
    Este nodo:
    1. Lee los mensajes actuales del estado
    2. Obtiene el LLM configurado (con tools bindeadas)
    3. Invoca el LLM
    4. Retorna el mensaje de respuesta (puede incluir tool_calls)
    
    Args:
        state: Estado actual del grafo con historial de mensajes
        ctx: TenantContext con configuración del workflow
    
    Returns:
        Dict con nuevos mensajes para agregar al estado
        
    Ejemplo de flujo:
        Estado entrante:
        {
            "messages": [
                HumanMessage("Agenda demo mañana 3pm"),
            ],
            "iteration_count": 0
        }
        
        LLM responde:
        AIMessage(
            content="",
            tool_calls=[{
                "name": "check_calendar",
                "args": {"date": "tomorrow", "time": "3pm"}
            }]
        )
        
        Estado saliente:
        {
            "messages": [
                HumanMessage("Agenda demo mañana 3pm"),
                AIMessage(tool_calls=[...])  ← Nuevo
            ],
            "iteration_count": 0
        }
    """
    
    # ==========================================
    # 1. Preparar mensajes
    # ==========================================
    messages = state["messages"]
    
    # Agregar system prompt si existe y no está en el historial
    model_config = ctx.get_model_config("default")
    system_prompt = model_config.get("systemPrompt") or ctx.agent_config.get("system_prompt")
    
    # Si hay system prompt y el primer mensaje no es system, agregarlo
    if system_prompt and (not messages or messages[0].type != "system"):
        messages = [SystemMessage(content=system_prompt)] + messages
    
    logger.info(
        f"[{ctx.workflow_id}] Calling LLM with {len(messages)} messages, "
        f"iteration {state.get('iteration_count', 0)}"
    )
    
    # ==========================================
    # 2. Obtener LLM con tools
    # ==========================================
    # get_llm retorna el LLM configurado (OpenAI, Anthropic, etc)
    # load_tools obtiene las tools habilitadas para este workflow
    llm = get_llm(ctx)
    tools = load_tools(ctx)
    
    # Bindear tools al LLM
    # Esto le permite al LLM decidir llamar estas tools
    llm_with_tools = llm.bind_tools(tools) if tools else llm
    
    logger.debug(
        f"[{ctx.workflow_id}] LLM: {model_config.get('model')}, "
        f"Tools: {[tool.name for tool in tools]}"
    )
    
    # ==========================================
    # 3. Invocar LLM
    # ==========================================
    try:
        response = llm_with_tools.invoke(messages)
        
        # Log para debugging
        if hasattr(response, 'tool_calls') and response.tool_calls:
            tool_names = [tc.get('name') for tc in response.tool_calls]
            logger.info(
                f"[{ctx.workflow_id}] LLM decided to call tools: {tool_names}"
            )
        else:
            logger.info(
                f"[{ctx.workflow_id}] LLM provided final response"
            )
        
        # Retornar nuevo mensaje
        # add_messages automáticamente lo concatena al historial
        return {"messages": [response]}
        
    except Exception as e:
        logger.error(
            f"[{ctx.workflow_id}] Error calling LLM: {str(e)}",
            exc_info=True
        )
        
        # Retornar mensaje de error para que el grafo no se rompa
        error_message = AIMessage(
            content=f"Lo siento, ocurrió un error al procesar tu solicitud: {str(e)}"
        )
        return {"messages": [error_message]}


def should_continue(state: ReactAgentState, ctx: TenantContext) -> Literal["tools", "end"]:
    """
    Decisión: ¿El LLM quiere llamar tools o terminar?
    
    Este es un CONDITIONAL EDGE (arista condicional).
    LangGraph lo llama después del nodo "agent" para decidir
    a dónde ir siguiente: al nodo "tools" o a END.
    
    Lógica:
    1. Si el último mensaje tiene tool_calls → ir a "tools"
    2. Si no tiene tool_calls → ir a "end" (respuesta final)
    3. Si excede max_iterations → forzar "end" (safety)
    
    Args:
        state: Estado actual con mensajes
        ctx: TenantContext con configuración
    
    Returns:
        "tools": Continuar al nodo de ejecución de tools
        "end": Terminar el grafo (respuesta final)
        
    Ejemplo:
        Mensaje con tool_calls:
        AIMessage(
            content="",
            tool_calls=[{"name": "check_calendar", ...}]
        )
        → Retorna "tools"
        
        Mensaje sin tool_calls (respuesta final):
        AIMessage(
            content="Demo agendada para mañana"
        )
        → Retorna "end"
    """
    
    # ==========================================
    # 1. Verificar límite de iteraciones
    # ==========================================
    # Safety para evitar loops infinitos
    max_iterations = ctx.agent_config.get("max_iterations", 10)
    current_iteration = state.get("iteration_count", 0)
    
    if current_iteration >= max_iterations:
        logger.warning(
            f"[{ctx.workflow_id}] Max iterations ({max_iterations}) reached. "
            f"Forcing end."
        )
        return "end"
    
    # ==========================================
    # 2. Verificar si el LLM quiere llamar tools
    # ==========================================
    last_message = state["messages"][-1]
    
    # Verificar si tiene tool_calls
    # tool_calls es una lista de dicts: [{"name": "tool_name", "args": {...}}]
    has_tool_calls = (
        hasattr(last_message, 'tool_calls') and 
        last_message.tool_calls and 
        len(last_message.tool_calls) > 0
    )
    
    if has_tool_calls:
        logger.info(
            f"[{ctx.workflow_id}] Continuing to tools execution. "
            f"Iteration {current_iteration + 1}/{max_iterations}"
        )
        return "tools"
    else:
        logger.info(
            f"[{ctx.workflow_id}] Agent provided final response. Ending."
        )
        return "end"


def increment_iteration(state: ReactAgentState) -> dict:
    """
    Incrementa el contador de iteraciones.
    
    Este nodo se ejecuta ANTES de volver al LLM después de ejecutar tools.
    Previene loops infinitos.
    
    Args:
        state: Estado actual
    
    Returns:
        Dict con iteration_count incrementado
    """
    current = state.get("iteration_count", 0)
    return {"iteration_count": current + 1}


# ==========================================
# Función Principal: Crear el Grafo
# ==========================================

def create_react_agent(ctx: TenantContext) -> StateGraph:
    """
    Crea y compila el grafo ReAct.
    
    Estructura del grafo:
    
        START
          ↓
        agent (call_model)
          ↓
        should_continue? (decisión)
          ├─→ tools → ToolNode → increment → agent (loop)
          └─→ END (respuesta final)
    
    Args:
        ctx: TenantContext con toda la configuración del workflow
    
    Returns:
        StateGraph compilado y listo para ejecutar
        
    Ejemplo de uso:
        ctx = TenantContext(...)
        graph = create_react_agent(ctx)
        
        result = graph.invoke({
            "messages": [HumanMessage("Agenda demo mañana 3pm")],
            "iteration_count": 0
        })
        
        print(result["messages"][-1].content)
        # → "Demo agendada para mañana a las 3pm"
    """
    
    logger.info(f"[{ctx.workflow_id}] Creating ReAct agent graph")
    
    # ==========================================
    # 1. Crear el grafo
    # ==========================================
    graph = StateGraph(ReactAgentState)
    
    # ==========================================
    # 2. Agregar nodos
    # ==========================================
    # Nodo principal que llama al LLM
    # Usamos lambda para pasar ctx al nodo
    graph.add_node("agent", lambda state: call_model(state, ctx))
    
    # Nodo de tools (usa ToolNode prebuilt de LangGraph)
    # ToolNode automáticamente:
    # - Lee tool_calls del último mensaje
    # - Ejecuta cada tool
    # - Agrega ToolMessage con resultados
    tools = load_tools(ctx)
    if tools:
        graph.add_node("tools", ToolNode(tools))
    
    # Nodo que incrementa contador
    graph.add_node("increment", increment_iteration)
    
    # ==========================================
    # 3. Definir aristas (edges)
    # ==========================================
    # Punto de entrada: START → agent
    graph.add_edge(START, "agent")
    
    # Arista condicional después del agent
    # should_continue decide: "tools" o "end"
    graph.add_conditional_edges(
        "agent",
        lambda state: should_continue(state, ctx),
        {
            "tools": "tools",  # Si el LLM quiere llamar tools
            "end": END        # Si el LLM terminó
        }
    )
    
    # Después de ejecutar tools:
    # tools → increment → agent (volver al LLM con resultados)
    if tools:
        graph.add_edge("tools", "increment")
        graph.add_edge("increment", "agent")
    
    # ==========================================
    # 4. Configurar interrupciones (opcional)
    # ==========================================
    # Si el workflow tiene interrupts configurados,
    # LangGraph pausará antes de ejecutar tools
    # Útil para: human-in-the-loop, aprobaciones, etc
    interrupts = ctx.agent_config.get("interrupts", [])
    interrupt_before = []
    
    if "before_tools" in interrupts and tools:
        interrupt_before.append("tools")
        logger.info(f"[{ctx.workflow_id}] Interrupts configured: before tools")
    
    # ==========================================
    # 5. Compilar el grafo
    # ==========================================
    # Compilar convierte el grafo en un runnable ejecutable
    compiled = graph.compile(
        interrupt_before=interrupt_before if interrupt_before else None
    )
    
    logger.info(
        f"[{ctx.workflow_id}] ReAct agent graph compiled successfully. "
        f"Tools: {len(tools)}, "
        f"Max iterations: {ctx.agent_config.get('max_iterations', 10)}"
    )
    
    return compiled
