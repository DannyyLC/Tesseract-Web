"""
Nodo tool: ejecuta una función de una tool instance directamente, sin LLM.
Los params soportan templates {{variables.x}} / {{context.x}}.
"""

import copy
import logging
from typing import Any, Dict

from langchain_core.messages import AIMessage, ToolMessage

from core.context import TenantContext
from tools import registry
from graphs.pipeline.templating import render_params

logger = logging.getLogger(__name__)


def make_tool_node(node_id: str, config: Dict[str, Any], ctx: TenantContext):
    """
    Crea un nodo que ejecuta una tool directamente, sin pasar por el LLM.

    Flujo:
    1. Busca el tool_instance en ctx.agent_tool_instances por UUID
    2. Carga la tool usando el registry existente
    3. Renderiza los parámetros (reemplaza templates)
    4. Ejecuta la función específica
    5. Guarda el resultado en state.variables[output_variable]

    Config:
        tool_instance:   UUID del TenantTool
        function:        Función específica a llamar
        params:          Parámetros (pueden tener templates)
        output_variable: Dónde guardar el resultado (opcional)
    """
    tool_instance_uuid = config.get("tool_instance")
    function_name = config.get("function")
    raw_params = config.get("params", {})
    output_variable = config.get("output_variable")

    # Buscar el tool_instance entre todos los agentes (se hace al construir el grafo)
    tool_instance = None
    for agent_tools in ctx.agent_tool_instances.values():
        if tool_instance_uuid in agent_tools:
            tool_instance = agent_tools[tool_instance_uuid]
            break

    if not tool_instance:
        raise ValueError(
            f"[{ctx.workflow_id}] Pipeline node '{node_id}': "
            f"tool_instance '{tool_instance_uuid}' no encontrado en agent_tool_instances"
        )

    # Cargar la tool una sola vez (closure)
    tool_name = tool_instance["tool_name"]
    credentials = tool_instance.get("credentials", {})
    tool_config = tool_instance.get("config", {})

    loaded_tools = registry.load_specific_tool(tool_name, credentials, tool_config, ctx)
    loaded_tools = [copy.deepcopy(t) for t in loaded_tools]

    # Buscar la función específica por nombre
    target_tool = next((t for t in loaded_tools if t.name == function_name), None)

    if not target_tool:
        available = [t.name for t in loaded_tools]
        raise ValueError(
            f"[{ctx.workflow_id}] Pipeline node '{node_id}': "
            f"función '{function_name}' no encontrada en '{tool_name}'. "
            f"Disponibles: {available}"
        )

    logger.info(
        f"[{ctx.workflow_id}] Pipeline node '{node_id}' "
        f"(tool:{tool_name}.{function_name}) initialized"
    )

    def node(state) -> dict:
        # Renderizar parámetros con valores del estado y del contexto
        rendered_params = render_params(raw_params, state, ctx)

        logger.info(
            f"[{ctx.workflow_id}] Pipeline node '{node_id}' executing "
            f"{tool_name}.{function_name} with params: {rendered_params}"
        )

        try:
            result = target_tool.invoke(rendered_params)
            logger.info(f"[{ctx.workflow_id}] Node '{node_id}' tool result: {str(result)[:200]}")
        except Exception as e:
            logger.error(f"[{ctx.workflow_id}] Node '{node_id}' tool error: {e}", exc_info=True)
            result = {"error": str(e)}

        # El resultado se agrega como contexto para nodos agente posteriores. Va como
        # PAR (AIMessage con tool_calls + ToolMessage): un ToolMessage suelto es un
        # historial inválido para los proveedores ("messages with role 'tool' must be
        # a response to a preceeding message with 'tool_calls'") y haría fallar a
        # cualquier LLM invocado después en el mismo turno. El AIMessage va sin
        # contenido: no se streamea ni se persiste en el historial.
        call_id = f"call_{node_id}"
        updates: Dict[str, Any] = {
            "current_node": node_id,
            "execution_path": [node_id],
            "messages": [
                AIMessage(
                    content="",
                    tool_calls=[{
                        "name": function_name,
                        "args": rendered_params,
                        "id": call_id,
                    }],
                ),
                ToolMessage(content=str(result), tool_call_id=call_id, name=function_name),
            ],
        }

        if output_variable:
            # Delta: solo la clave que cambió (los reducers mergean)
            updates["variables"] = {output_variable: result}
            logger.info(
                f"[{ctx.workflow_id}] Node '{node_id}' stored tool result in "
                f"variables.{output_variable}"
            )

        return updates

    return node
