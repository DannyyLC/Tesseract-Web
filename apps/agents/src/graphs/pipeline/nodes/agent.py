"""
Nodo agent: llama al LLM del agente configurado, con modo agéntico opcional
(loop LLM ↔ tools), clasificación de intents, gating determinista de tools y
modo silent para pasos internos.
"""

import logging
import re
from typing import Any, Dict, List

from langchain_core.messages import AIMessage, ToolMessage

from core.context import TenantContext
from core.prompts import apply_system_prompt, build_time_context
from tools import registry
from graphs.pipeline.conditions import evaluate_condition
from graphs.pipeline.routing import extract_intents, normalize_intents
from graphs.pipeline.state import NO_STREAM_TAG
from graphs.pipeline.templating import render_template_value, resolve_path

logger = logging.getLogger(__name__)


def tool_base_name(tool: Any) -> str | None:
    """Nombre original de la tool antes del sufijo de display_name (registry.load_tools)."""
    return (getattr(tool, "metadata", None) or {}).get("base_name")


def tool_name_matches(configured_name: str, tool: Any) -> bool:
    """
    Matchea el nombre de tool de una config contra una tool cargada.

    Las tools se renombran a '{base}_{display_suffix}' al cargarse; las configs
    pueden referenciarlas por el nombre base (recomendado) o por el nombre completo.
    """
    return configured_name == tool.name or configured_name == tool_base_name(tool)


def make_agent_node(node_id: str, agent_name: str, output_variable: str | None, ctx: TenantContext,
                    classification_pattern: str | None = None, max_iterations: int = 0,
                    disable_tools_if: List[Dict[str, Any]] | None = None,
                    set_variables_on_tool_call: Dict[str, Dict[str, Any]] | None = None,
                    silent: bool = False,
                    system_prompt_extra: str = ""):
    """
    Crea un nodo que llama al LLM y opcionalmente guarda su respuesta en variables.

    El LLM se inicializa una sola vez al construir el grafo (no en cada ejecución).

    Modos de operación:
    - Single-call (default, max_iterations=0): una llamada al LLM, sin tools.
    - Agéntico (max_iterations>0): loop LLM ↔ tools hasta respuesta de texto o límite de iteraciones.
      Las tools (instancias + signal_tools) se cargan vía registry.load_tools().

    Args:
        node_id:                ID del nodo (para logging)
        agent_name:             Clave en agents_config ("default", "classifier", "sales", etc)
        output_variable:        Si se especifica, guarda un valor en variables[output_variable].
                                Sin classification_pattern → guarda el content completo.
                                Con classification_pattern → guarda los intents extraídos.
        ctx:                    TenantContext con toda la configuración
        classification_pattern: Regex opcional. Si el LLM incluye el patrón en su respuesta, se
                                extraen los intents, se guardan en variables[output_variable] y el
                                tag se limpia del mensaje visible. Si el mensaje queda vacío tras
                                limpiar, no se agrega al historial. Si variables.routing_locked es
                                True, el patrón se ignora. En modo agéntico, el patrón se evalúa
                                solo sobre la respuesta final de texto.
        max_iterations:         Número máximo de rondas LLM↔tools (0 = single-call, sin tools).
        disable_tools_if:       Lista de reglas para deshabilitar tools según el estado, evaluadas al
                                inicio de cada ejecución del nodo. Cada regla:
                                  {"tool": "nombre" (opcional, None = todas),
                                   "field": "variables.x", "op": "eq", "value": ...}
                                Si la regla matchea, la tool NO se enlaza al LLM en esta ejecución
                                (el LLM no puede llamarla). Gating determinista, sin prompt.
        set_variables_on_tool_call:
                                Mapa {tool_name: {variable: valor}}. Cuando el LLM llama esa tool,
                                las variables se setean de forma determinista en el estado, en el
                                momento del intento (independiente de si la tool tuvo éxito).
                                El tool_name puede ser el nombre base (sin sufijo de display_name)
                                o el nombre completo.
        silent:                 Si True, el nodo es INTERNO: toda llamada LLM lleva NO_STREAM_TAG
                                (sus tokens nunca llegan al usuario), su respuesta va SOLO a
                                variables[output_variable] y no escribe messages ni
                                specialist_outputs. El usage se reporta vía el canal
                                internal_usage para el accounting del servicer.
        system_prompt_extra:    Template opcional que se suma al system prompt del agente en cada
                                ejecución (p.ej. "{{variables.handoff_notice_text}}"). Un template
                                que resuelve a vacío no agrega nada.
    """
    llm = registry.get_llm(ctx, agent_name)
    pattern = re.compile(classification_pattern) if classification_pattern else None

    # Modo agéntico: cargar tools una sola vez al construir el grafo
    agent_tools = registry.load_tools(ctx, agent_name) if max_iterations > 0 else []
    llm_with_tools = llm.bind_tools(agent_tools) if agent_tools else llm
    tools_by_name = {t.name: t for t in agent_tools}
    is_agentic = bool(agent_tools)

    logger.info(
        f"[{ctx.workflow_id}] Pipeline node '{node_id}' (agent:{agent_name}) initialized"
        + (f" [agentic, {len(agent_tools)} tools, max_iterations={max_iterations}]" if is_agentic else "")
    )

    def node(state) -> dict:
        messages = list(state["messages"])
        agent_config = ctx.get_agent_config(agent_name)
        # El system prompt soporta templates {{variables.x}} / {{context.x}}
        # (los namespaces desconocidos, p.ej. "{{1}}", se dejan literales)
        base_system_prompt = render_template_value(
            agent_config.get("system_prompt", ""), state, ctx
        )

        # Rama de un fan-out multi-intent (viaja en el input del Send, no en el estado global)
        parallel = bool(state.get("parallel_mode"))

        # Lecturas sobre el estado; escrituras SOLO al delta (los canales usan reducers
        # de merge — escribir una copia completa pisaría escrituras de ramas paralelas)
        state_vars = state.get("variables", {})
        variables_delta: Dict[str, Any] = {}

        time_context = build_time_context(ctx)
        system_prompt = base_system_prompt + time_context if base_system_prompt else time_context

        # system_prompt_extra: texto adicional declarado en la config del nodo,
        # con templates. Si resuelve a vacío, no agrega nada.
        if system_prompt_extra:
            extra = render_template_value(system_prompt_extra, state, ctx)
            if extra and str(extra).strip():
                system_prompt = (system_prompt + "\n\n" + str(extra)) if system_prompt else str(extra)

        # Canal interno (legacy): un nodo set_variables previo pudo dejar texto a sumar
        # al system prompt. Se consume aquí (delta a None; None se trata como ausente).
        append_system_msg = state_vars.get("__append_system_message__")
        if append_system_msg:
            system_prompt = (system_prompt + "\n\n" + append_system_msg) if system_prompt else append_system_msg
            variables_delta["__append_system_message__"] = None

        messages = apply_system_prompt(messages, system_prompt)

        updates: Dict[str, Any] = {
            "current_node": node_id,
            "execution_path": [node_id],
        }

        def invoke_llm(llm_obj, msgs):
            # En paralelo (y en nodos silent) los tokens no deben llegar al stream
            # del usuario; el servicer filtra las llamadas con NO_STREAM_TAG.
            if parallel or silent:
                return llm_obj.invoke(msgs, config={"tags": [NO_STREAM_TAG]})
            return llm_obj.invoke(msgs)

        # ------------------------------------------------------------------
        # Llamada al LLM: single-call o loop agéntico
        # ------------------------------------------------------------------
        preceding_messages: List[Any] = []  # mensajes intermedios (tool calls + results)
        final_response: AIMessage

        if is_agentic:
            current_messages = list(messages)
            content = ""

            # Gating determinista de tools: evaluar disable_tools_if contra el estado actual.
            # Las tools deshabilitadas NO se enlazan al LLM en esta ejecución — no puede llamarlas.
            if disable_tools_if:
                active_tools = []
                for t in agent_tools:
                    disabled = False
                    for rule in disable_tools_if:
                        rule_tool = rule.get("tool")
                        if rule_tool is not None and not tool_name_matches(rule_tool, t):
                            continue
                        field_value = resolve_path(state, rule.get("field", ""), ctx)
                        if evaluate_condition(rule.get("op", "eq"), field_value, rule.get("value")):
                            disabled = True
                            break
                    if disabled:
                        logger.info(
                            f"[{ctx.workflow_id}] Node '{node_id}': tool '{t.name}' "
                            f"disabled by disable_tools_if rule"
                        )
                    else:
                        active_tools.append(t)
                runtime_llm = llm.bind_tools(active_tools) if active_tools else llm
            else:
                runtime_llm = llm_with_tools

            logger.info(
                f"[{ctx.workflow_id}] Pipeline node '{node_id}' starting agentic loop "
                f"({agent_name}, max_iterations={max_iterations})"
            )

            for _i in range(max_iterations):
                try:
                    response = invoke_llm(runtime_llm, current_messages)
                except Exception as e:
                    logger.error(f"[{ctx.workflow_id}] Node '{node_id}' LLM error: {e}", exc_info=True)
                    response = AIMessage(content=f"Error en nodo {node_id}: {str(e)}")

                if not getattr(response, "tool_calls", None):
                    # Respuesta final de texto — salir del loop
                    final_response = response
                    content = response.content
                    break

                # LLM quiere llamar tools: ejecutar y continuar
                logger.info(
                    f"[{ctx.workflow_id}] Node '{node_id}' iteration {_i + 1}: "
                    f"{len(response.tool_calls)} tool call(s): "
                    f"{[tc['name'] for tc in response.tool_calls]}"
                )
                preceding_messages.append(response)
                current_messages.append(response)

                for tc in response.tool_calls:
                    tool = tools_by_name.get(tc["name"])

                    # Setear variables de forma determinista al intentar llamar la tool
                    # (independiente del resultado — ver docstring de set_variables_on_tool_call).
                    # La config puede usar el nombre base o el nombre completo con sufijo.
                    if set_variables_on_tool_call:
                        sv_key = None
                        if tc["name"] in set_variables_on_tool_call:
                            sv_key = tc["name"]
                        elif tool is not None and tool_base_name(tool) in set_variables_on_tool_call:
                            sv_key = tool_base_name(tool)
                        if sv_key:
                            variables_delta.update(set_variables_on_tool_call[sv_key])
                            logger.info(
                                f"[{ctx.workflow_id}] Node '{node_id}': tool call '{tc['name']}' "
                                f"set variables {list(set_variables_on_tool_call[sv_key].keys())}"
                            )

                    try:
                        if tool:
                            tool_result = tool.invoke(tc["args"])
                            logger.info(
                                f"[{ctx.workflow_id}] Node '{node_id}' tool '{tc['name']}' "
                                f"result: {str(tool_result)[:200]}"
                            )
                        else:
                            tool_result = f"Tool '{tc['name']}' no disponible"
                            logger.warning(
                                f"[{ctx.workflow_id}] Node '{node_id}': "
                                f"tool '{tc['name']}' not found in agent tools"
                            )
                    except Exception as e:
                        logger.error(
                            f"[{ctx.workflow_id}] Node '{node_id}' tool '{tc['name']}' error: {e}",
                            exc_info=True,
                        )
                        tool_result = f"Error ejecutando '{tc['name']}': {str(e)}"

                    tm = ToolMessage(
                        content=str(tool_result),
                        tool_call_id=tc["id"],
                        name=tc["name"],
                    )
                    preceding_messages.append(tm)
                    current_messages.append(tm)

            else:
                # Se agotaron las iteraciones sin respuesta de texto — forzar respuesta final
                logger.warning(
                    f"[{ctx.workflow_id}] Node '{node_id}' reached max_iterations "
                    f"({max_iterations}), forcing final text response"
                )
                try:
                    final_response = invoke_llm(llm, current_messages)
                    content = final_response.content
                except Exception as e:
                    logger.error(
                        f"[{ctx.workflow_id}] Node '{node_id}' final LLM error: {e}", exc_info=True
                    )
                    final_response = AIMessage(content=f"Error en nodo {node_id}: {str(e)}")
                    content = final_response.content

        else:
            # Single-call
            logger.info(
                f"[{ctx.workflow_id}] Pipeline node '{node_id}' calling LLM ({agent_name}) "
                f"with {len(messages)} messages"
            )
            try:
                final_response = invoke_llm(llm, messages)
            except Exception as e:
                logger.error(f"[{ctx.workflow_id}] Node '{node_id}' LLM error: {e}", exc_info=True)
                final_response = AIMessage(content=f"Error en nodo {node_id}: {str(e)}")

            content = final_response.content

        # ------------------------------------------------------------------
        # Procesar respuesta final: classification_pattern y output_variable
        # ------------------------------------------------------------------
        if pattern and parallel:
            # Los especialistas de un fan-out no re-rutean: los intents ya fueron
            # decididos. Solo limpiar tags residuales del texto visible.
            content = pattern.sub("", content).strip()
        elif pattern:
            if not state_vars.get("routing_locked"):
                intents, cleaned = extract_intents(pattern, content)
                if intents:
                    content = cleaned

                    previous_intents = normalize_intents(
                        state_vars.get(output_variable) if output_variable else None
                    )
                    if output_variable:
                        # Siempre lista (el router acepta lista o string legacy)
                        variables_delta[output_variable] = intents

                    if set(intents) != set(previous_intents):
                        variables_delta["reroute_count"] = state_vars.get("reroute_count", 0) + 1

                    logger.info(
                        f"[{ctx.workflow_id}] Node '{node_id}' extracted intents {intents} "
                        f"(reroute_count={variables_delta.get('reroute_count', state_vars.get('reroute_count', 0))})"
                    )
        elif output_variable and not silent:
            variables_delta[output_variable] = content.strip()
            logger.info(
                f"[{ctx.workflow_id}] Node '{node_id}' stored response in "
                f"variables.{output_variable}: '{content.strip()[:100]}'"
            )

        # ------------------------------------------------------------------
        # Construir salida del nodo
        # ------------------------------------------------------------------
        if silent:
            # Nodo interno: la respuesta va SOLO a variables[output_variable];
            # nada al historial ni a specialist_outputs. El usage se reporta por
            # internal_usage para que el accounting del servicer no lo pierda.
            # Con classification_pattern, output_variable ya recibió los intents
            # extraídos arriba: NO lo pisamos con el contenido (permite un router
            # silent que solo clasifica, sin filtrar texto al usuario).
            if output_variable and pattern is None:
                variables_delta[output_variable] = content.strip() if isinstance(content, str) else content
            usage = getattr(final_response, "usage_metadata", None)
            if usage:
                updates["internal_usage"] = [{
                    "usage_metadata": usage,
                    "response_metadata": getattr(final_response, "response_metadata", None),
                }]
            if variables_delta:
                updates["variables"] = variables_delta
            return updates

        if parallel:
            # Rama de fan-out: la respuesta NO va al historial (evita N burbujas al
            # usuario); va a specialist_outputs para que el synthesizer la combine.
            updates["specialist_outputs"] = [{
                "node_id": node_id,
                "agent": agent_name,
                "intent": state.get("current_intent"),
                "content": content,
                "usage_metadata": getattr(final_response, "usage_metadata", None),
                "response_metadata": getattr(final_response, "response_metadata", None),
            }]
        else:
            # preceding_messages contiene los AIMessage(tool_calls) + ToolMessages intermedios.
            # El mensaje final solo se agrega si tiene contenido visible tras limpiar el tag.
            if content:
                if content == final_response.content:
                    final_msg = final_response
                else:
                    # Mensaje limpio, preservando metadata de tokens para el accounting del servicer
                    final_msg = AIMessage(content=content)
                    if getattr(final_response, "usage_metadata", None):
                        final_msg.usage_metadata = final_response.usage_metadata
                    if getattr(final_response, "response_metadata", None):
                        final_msg.response_metadata = final_response.response_metadata

                updates["messages"] = preceding_messages + [final_msg]
            elif preceding_messages:
                # Solo hubo tool calls (sin texto final visible)
                updates["messages"] = preceding_messages

        if variables_delta:
            updates["variables"] = variables_delta

        return updates

    return node
