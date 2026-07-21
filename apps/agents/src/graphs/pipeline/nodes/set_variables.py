"""
Nodo set_variables: setea variables en el estado sin llamar al LLM.
"""

import logging
from typing import Any, Dict

from core.context import TenantContext
from graphs.pipeline.templating import render_params, render_template_value

logger = logging.getLogger(__name__)


def make_set_variables_node(node_id: str, config: Dict[str, Any], ctx: TenantContext):
    """
    Nodo sin LLM que:
    1. Setea variables en el estado.
    2. Opcionalmente deja texto para sumar al system prompt del siguiente nodo agent
       (vía el canal interno variables.__append_system_message__, que el agent consume
       y limpia). Alternativa explícita: system_prompt_extra en el nodo agent.

    Config:
        variables:             dict con las variables a setear. Los valores soportan
                                templates {{variables.x}} / {{context.x}}, resueltos
                                contra el estado en el momento de ejecución.
        append_system_message: texto a agregar al system prompt del siguiente nodo agent.
                                También soporta templates.
    """
    variables_to_set = config.get("variables", {})
    append_msg_template = config.get("append_system_message", "")

    logger.info(f"[{ctx.workflow_id}] set_variables node '{node_id}' initialized")

    def node(state) -> dict:
        # Delta: solo las claves seteadas (los reducers mergean), templates resueltos
        variables_delta = render_params(variables_to_set, state, ctx)

        append_msg = (
            render_template_value(append_msg_template, state, ctx) if append_msg_template else ""
        )
        if append_msg:
            variables_delta["__append_system_message__"] = append_msg

        logger.info(
            f"[{ctx.workflow_id}] set_variables '{node_id}': "
            f"vars={list(variables_to_set.keys())}, append_msg={bool(append_msg)}"
        )

        return {
            "variables": variables_delta,
            "current_node": node_id,
            "execution_path": [node_id],
        }

    return node
