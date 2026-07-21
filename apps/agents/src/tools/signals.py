"""
Signal Tools - Tools sin efectos definidas 100% por configuración.

Permiten que un LLM "marque" cosas (solicitar handoff, señalar interés, pedir
seguimiento) sin escribir Python nuevo por señal: la tool no ejecuta nada, solo
devuelve un texto fijo. El efecto real lo produce la config del nodo vía
set_variables_on_tool_call (variables deterministas al momento de la llamada) y,
después, el propio grafo (condiciones, nodos tool, acciones post-turno).

DECLARACIÓN (en agents_config[<agente>].signal_tools):
    "signal_tools": [
        {
            "name": "solicitar_asesor",
            "description": "Llama esto cuando el cliente quiera hablar con un asesor humano.",
            "args": {"detalle": "Breve nota del contexto de la solicitud"},   # opcional
            "response": "Solicitud registrada. El equipo será notificado."     # opcional
        }
    ]
"""

import logging
from typing import Any

from langchain_core.tools import BaseTool, StructuredTool
from pydantic import Field, create_model

logger = logging.getLogger(__name__)

DEFAULT_RESPONSE = "Registrado."


def _build_args_schema(name: str, args: dict[str, str] | None):
    """Modelo pydantic dinámico desde {arg_name: descripción}. Todos strings opcionales."""
    fields: dict[str, Any] = {
        arg_name: (str, Field(default="", description=str(description)))
        for arg_name, description in (args or {}).items()
    }
    return create_model(f"{name}_args", **fields)


def load_signal_tools(signal_defs: list[dict[str, Any]] | None) -> list[BaseTool]:
    """
    Construye las signal tools declaradas en config.

    Cada definición: {"name", "description", "args" (opcional), "response" (opcional)}.
    Las tools llevan metadata.base_name = name para que disable_tools_if y
    set_variables_on_tool_call les apliquen igual que a cualquier tool.
    """
    tools: list[BaseTool] = []

    for definition in signal_defs or []:
        name = (definition or {}).get("name")
        description = (definition or {}).get("description")
        if not name or not description:
            logger.warning("signal_tools: definición sin 'name' o 'description' — ignorada")
            continue

        response_text = definition.get("response") or DEFAULT_RESPONSE

        def _signal(response=response_text, **kwargs) -> str:
            return response

        tool = StructuredTool.from_function(
            func=_signal,
            name=name,
            description=description,
            args_schema=_build_args_schema(name, definition.get("args")),
        )
        tool.metadata = {"base_name": name, "signal": True}
        tools.append(tool)
        logger.debug("signal_tools: tool '%s' construida", name)

    return tools
