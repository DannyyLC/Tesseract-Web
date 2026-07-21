"""
Nodo synthesizer: convergencia del fan-out multi-intent. Combina los
specialist_outputs en UNA respuesta final al usuario.
"""

import logging
from typing import Any, Dict

from langchain_core.messages import AIMessage

from core.context import TenantContext
from core.prompts import apply_system_prompt, build_time_context
from tools import registry
from graphs.pipeline.templating import render_params, render_template_value

logger = logging.getLogger(__name__)


def make_synthesizer_node(node_id: str, agent_name: str, config: Dict[str, Any], ctx: TenantContext):
    """
    Nodo de convergencia del fan-out multi-intent.

    Combina los specialist_outputs en UNA respuesta final al usuario:
    - 1 output  → pass-through sin LLM (el texto del especialista tal cual).
    - 2+ outputs → una llamada al LLM del agente synthesizer con las respuestas
      etiquetadas por especialista en el system prompt.
    - 0 outputs → no-op (en modo single el especialista ya respondió al usuario).

    Config del nodo:
        set_variables:      dict de variables a setear al terminar la síntesis
                            (p.ej. {"intent": []} para resetear el ruteo). Los valores
                            soportan templates (p.ej. {"previous_intent":
                            "{{variables.intent}}"}). Solo aplica cuando la síntesis
                            corrió (hubo outputs).
        system_prompt_extra: template opcional a sumar al system prompt de la síntesis
                            (p.ej. "{{variables.handoff_notice_text}}"). Vacío al
                            resolver → no agrega nada.

    El agente (agent_name) debe existir en agents_config como cualquier otro:
    define model, temperature y system_prompt del sintetizador.
    """
    llm = registry.get_llm(ctx, agent_name)
    system_prompt_extra = config.get("system_prompt_extra", "")
    set_variables_on_finish = config.get("set_variables", {})

    logger.info(
        f"[{ctx.workflow_id}] Synthesizer node '{node_id}' (agent:{agent_name}) initialized"
    )

    def node(state) -> dict:
        outputs = state.get("specialist_outputs", [])

        updates: Dict[str, Any] = {
            "current_node": node_id,
            "execution_path": [node_id],
        }

        if not outputs:
            logger.info(
                f"[{ctx.workflow_id}] Synthesizer '{node_id}': sin specialist_outputs — no-op"
            )
            return updates

        if len(outputs) == 1:
            # Pass-through sin LLM. Sin usage_metadata: el accounting del servicer
            # ya suma los specialist_outputs (evita doble conteo).
            final_msg = AIMessage(content=outputs[0].get("content", ""))
            logger.info(
                f"[{ctx.workflow_id}] Synthesizer '{node_id}': 1 output → pass-through"
            )
        else:
            agent_config = ctx.get_agent_config(agent_name)
            base_system_prompt = render_template_value(
                agent_config.get("system_prompt", ""), state, ctx
            )

            outputs_block = "\n\nRESPUESTAS DE LOS ESPECIALISTAS:\n" + "\n\n".join(
                f"[{o.get('intent') or o.get('agent')}]\n{o.get('content', '')}"
                for o in outputs
            )

            system_prompt = (base_system_prompt or "") + build_time_context(ctx)
            if system_prompt_extra:
                extra = render_template_value(system_prompt_extra, state, ctx)
                if extra and str(extra).strip():
                    system_prompt += "\n\n" + str(extra)
            system_prompt += outputs_block

            messages = apply_system_prompt(list(state["messages"]), system_prompt)

            logger.info(
                f"[{ctx.workflow_id}] Synthesizer '{node_id}': combinando "
                f"{len(outputs)} outputs"
            )
            try:
                final_msg = llm.invoke(messages)
            except Exception as e:
                logger.error(
                    f"[{ctx.workflow_id}] Synthesizer '{node_id}' LLM error: {e}",
                    exc_info=True,
                )
                # Fallback: concatenar las respuestas para no dejar al usuario sin nada
                final_msg = AIMessage(
                    content="\n\n".join(o.get("content", "") for o in outputs if o.get("content"))
                )

        updates["messages"] = [final_msg]

        # Templates {{variables.x}} resueltos contra el estado (p.ej. "previous_intent":
        # "{{variables.intent}}" copia el intent vigente antes de resetearlo).
        variables_delta: Dict[str, Any] = render_params(set_variables_on_finish, state, ctx)

        if variables_delta:
            # Delta: solo las claves configuradas (los reducers mergean)
            updates["variables"] = variables_delta
            logger.info(
                f"[{ctx.workflow_id}] Synthesizer '{node_id}': set variables "
                f"{list(variables_delta.keys())} al finalizar"
            )

        return updates

    return node
