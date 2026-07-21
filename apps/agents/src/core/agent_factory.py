"""
Agent Factory - Crea grafos de LangGraph según configuración del Workflow.

RESPONSABILIDAD:
- Recibe TenantContext con toda la configuración
- Decide QUÉ tipo de grafo crear según agent_config.graph_type
- Delega la creación a builders especializados
- Retorna el grafo compilado y listo para ejecutar
"""

from typing import Callable, Dict
from langgraph.graph import StateGraph
import logging

from core.context import TenantContext

# Imports de los builders específicos
from graphs.react_agent import create_react_agent
from graphs.pipeline_agent import create_pipeline_agent
from graphs.router_agent import create_router_agent
from graphs.sequential_agent import create_sequential_agent
from graphs.supervisor_agent import create_supervisor_agent


# ==========================================
# Logger para debugging
# ==========================================
logger = logging.getLogger(__name__)


# ==========================================
# Tipo de función builder
# ==========================================
# Cada builder tiene esta firma:
# - Recibe TenantContext
# - Retorna StateGraph compilado
GraphBuilder = Callable[[TenantContext], StateGraph]


# ==========================================
# Registry de builders
# ==========================================
# Mapeo de graph_type → función builder
# 
# Cuando agregas un nuevo tipo de grafo:
# 1. Creas el archivo graphs/mi_nuevo_grafo.py
# 2. Implementas create_mi_nuevo_grafo(ctx: TenantContext) -> StateGraph
# 3. Lo importas arriba
# 4. Lo agregas a este diccionario
GRAPH_BUILDERS: Dict[str, GraphBuilder] = {
    "react": create_react_agent,
    "pipeline": create_pipeline_agent,
    "router": create_router_agent,
    "sequential": create_sequential_agent,
    "supervisor": create_supervisor_agent,
}


# ==========================================
# Función principal del Factory
# ==========================================
def create_agent_graph(ctx: TenantContext) -> StateGraph:
    """
    Factory que crea el grafo apropiado según ctx.agent_config["graph_type"].
    
    Args:
        ctx: TenantContext con toda la configuración del workflow
    
    Returns:
        StateGraph compilado y listo para ejecutar
    
    Raises:
        ValueError: Si graph_type no existe o no está configurado
        
    Ejemplo:
        # Gateway construye contexto
        ctx = TenantContext(
            tenant_id="org-123",
            workflow_id="asistente-ventas",
            agent_config={
                "graph_type": "react",  # ← Este valor decide qué builder usar
                "system_prompt": "Eres un asistente...",
            },
            ...
        )
        
        # Factory crea el grafo apropiado
        graph = create_agent_graph(ctx)
        
        # Ejecutar
        result = graph.invoke({"messages": [...]})
    """
    
    # ==========================================
    # 1. Extraer graph_type de configuración
    # ==========================================
    # graph_config viene de Workflow.config.graph en la DB
    # Ejemplo: {"type": "react", "config": {"max_iterations": 10, "allow_interrupts": false}}
    graph_type = ctx.graph_config.get("type")
    
    # Validar que existe
    if not graph_type:
        logger.error(
            f"No graph type specified in graph_config for workflow {ctx.workflow_id}. "
            f"graph_config: {ctx.graph_config}"
        )
        raise ValueError(
            "graph_config must include 'type' field. "
            f"Available types: {list(GRAPH_BUILDERS.keys())}"
        )
    
    # Log para debugging
    logger.info(
        f"Creating graph for workflow={ctx.workflow_id}, "
        f"type={graph_type}, "
        f"tenant={ctx.tenant_id}"
    )
    
    # ==========================================
    # 2. Buscar el builder apropiado
    # ==========================================
    # Busca en el diccionario GRAPH_BUILDERS
    builder = GRAPH_BUILDERS.get(graph_type)
    
    # Validar que el tipo existe
    if not builder:
        available_types = list(GRAPH_BUILDERS.keys())
        logger.error(
            f"Unknown graph_type '{graph_type}' for workflow {ctx.workflow_id}. "
            f"Available: {available_types}"
        )
        raise ValueError(
            f"Unknown graph_type: '{graph_type}'. "
            f"Available types: {available_types}"
        )
    
    # ==========================================
    # 3. Llamar al builder específico
    # ==========================================
    # El builder recibe el TenantContext completo y retorna el grafo compilado
    # 
    # Por ejemplo, si graph_type="react":
    #   - builder apunta a create_react_agent
    #   - Se ejecuta: create_react_agent(ctx)
    #   - Retorna un StateGraph configurado para ReAct
    try:
        logger.info(f"Building {graph_type} graph with builder: {builder.__name__}")
        
        # Llamar al builder
        graph = builder(ctx)
        
        logger.info(
            f"Successfully created {graph_type} graph for workflow {ctx.workflow_id}"
        )
        
        return graph
        
    except Exception as e:
        # Si el builder falla, loguear detalles útiles
        logger.error(
            f"Failed to create {graph_type} graph for workflow {ctx.workflow_id}. "
            f"Error: {str(e)}",
            exc_info=True  # Incluye stack trace completo
        )
        raise  # Re-lanzar para que el caller maneje el error


# ==========================================
# Funciones auxiliares
# ==========================================
def get_available_graph_types() -> list[str]:
    """
    Retorna lista de graph_types soportados.
    
    Útil para:
    - Validación en el Gateway antes de guardar Workflow
    - Mostrar opciones en el frontend
    - Documentación de API
    
    Returns:
        Lista de strings con tipos disponibles
        
    Ejemplo:
        >>> get_available_graph_types()
        ['react', 'router', 'sequential', 'supervisor']
    """
    return list(GRAPH_BUILDERS.keys())
