"""
Builder del pipeline: construye dinámicamente el grafo LangGraph desde el
graph_config del workflow.

PATRÓN PIPELINE:
- Los nodos y conexiones se definen en graph_config, no en código.
- Tipos de nodo: agent, tool, condition (primera clase), set_variables, synthesizer.
- state.variables es el "bus de datos"; los nodos leen/escriben deltas y los
  reducers (declarables por variable) los combinan.
- El estado existe solo durante la ejecución; el Gateway persiste lo declarado
  en persist_variables.

El contrato completo del schema está en docs/graph-schema.md.
"""

import logging
from typing import Dict, List

from langgraph.graph import StateGraph, END, START

from core.context import TenantContext
from graphs.pipeline.conditions import make_condition_function
from graphs.pipeline.nodes import (
    make_agent_node,
    make_set_variables_node,
    make_synthesizer_node,
    make_tool_node,
)
from graphs.pipeline.state import SUPPORTED_SCHEMA_VERSION, build_state_class

logger = logging.getLogger(__name__)


def create_pipeline_agent(ctx: TenantContext) -> StateGraph:
    """
    Construye dinámicamente el grafo LangGraph desde la configuración del workflow.

    Lee ctx.graph_config["nodes"] y ctx.graph_config["edges"]:
    - Nodos 'agent', 'tool', 'set_variables' y 'synthesizer' son nodos de LangGraph.
    - Nodos 'condition' son nodos de PRIMERA CLASE (pass-through) cuyas salidas son
      conditional edges — pueden ser destino de cualquier arista o del router.
    """
    # Versionado del contrato del schema (evolución solo aditiva; ver docs/graph-schema.md)
    schema_version = ctx.graph_config.get("schema_version", 1)
    if not isinstance(schema_version, int) or schema_version > SUPPORTED_SCHEMA_VERSION:
        raise ValueError(
            f"[{ctx.workflow_id}] graph_config.schema_version={schema_version} no soportado "
            f"(máximo: {SUPPORTED_SCHEMA_VERSION})"
        )

    nodes_config: List[Dict] = ctx.graph_config.get("nodes", [])
    edges_config: List[Dict] = ctx.graph_config.get("edges", [])

    if not nodes_config:
        raise ValueError(
            f"[{ctx.workflow_id}] Pipeline graph_config requires 'nodes' list"
        )
    if not edges_config:
        raise ValueError(
            f"[{ctx.workflow_id}] Pipeline graph_config requires 'edges' list"
        )

    logger.info(
        f"[{ctx.workflow_id}] Building pipeline graph: "
        f"{len(nodes_config)} nodes, {len(edges_config)} edges"
    )

    # Schema de estado por workflow (reducers de variables declarados en config)
    state_class = build_state_class(ctx.graph_config.get("variable_reducers"))
    graph = StateGraph(state_class)

    # =========================================================================
    # 1. Agregar nodos al grafo
    # =========================================================================
    for node in nodes_config:
        node_id = node["id"]
        node_type = node.get("type")

        if node_type == "agent":
            graph.add_node(node_id, make_agent_node(
                node_id,
                node.get("agent", "default"),
                node.get("output_variable"),
                ctx,
                classification_pattern=node.get("classification_pattern"),
                max_iterations=node.get("max_iterations", 0),
                disable_tools_if=node.get("disable_tools_if"),
                set_variables_on_tool_call=node.get("set_variables_on_tool_call"),
                silent=bool(node.get("silent", False)),
                system_prompt_extra=node.get("system_prompt_extra", ""),
            ))
            logger.debug(f"[{ctx.workflow_id}] Added agent node: '{node_id}'")

        elif node_type == "tool":
            graph.add_node(node_id, make_tool_node(node_id, node.get("config", {}), ctx))
            logger.debug(f"[{ctx.workflow_id}] Added tool node: '{node_id}'")

        elif node_type == "set_variables":
            graph.add_node(node_id, make_set_variables_node(node_id, node.get("config", {}), ctx))
            logger.debug(f"[{ctx.workflow_id}] Added set_variables node: '{node_id}'")

        elif node_type == "synthesizer":
            graph.add_node(node_id, make_synthesizer_node(
                node_id, node.get("agent", "synthesizer"), node.get("config", {}), ctx
            ))
            logger.debug(f"[{ctx.workflow_id}] Added synthesizer node: '{node_id}'")

        elif node_type == "condition":
            # Nodo de PRIMERA CLASE: pass-through + conditional edges desde él.
            # Así puede ser destino de cualquier arista (incluido el router) y
            # mapea 1:1 a un nodo visual con puertos de salida.
            def _make_passthrough(nid):
                def passthrough(state) -> dict:
                    return {"current_node": nid, "execution_path": [nid]}
                return passthrough

            graph.add_node(node_id, _make_passthrough(node_id))
            graph.add_conditional_edges(
                node_id, make_condition_function(node_id, node["config"], ctx)
            )
            logger.debug(f"[{ctx.workflow_id}] Added condition node: '{node_id}'")

        else:
            raise ValueError(
                f"[{ctx.workflow_id}] Unknown node type '{node_type}' in node '{node_id}'. "
                f"Supported types: 'agent', 'tool', 'set_variables', 'condition', 'synthesizer'. "
                f"Note: 'agent' nodes support tool calling via max_iterations>0."
            )

    # =========================================================================
    # 2. Procesar aristas
    # =========================================================================
    for edge in edges_config:
        from_id = edge["from"]
        to_id = edge["to"]

        from_node = START if from_id == "START" else from_id

        if to_id == "END":
            graph.add_edge(from_node, END)
            logger.debug(f"[{ctx.workflow_id}] Edge: '{from_id}' → END")
            continue

        # Las conditions son nodos reales: una arista hacia ellas es una arista
        # normal (la bifurcación son los conditional edges DESDE la condition).
        graph.add_edge(from_node, to_id)
        logger.debug(f"[{ctx.workflow_id}] Edge: '{from_id}' → '{to_id}'")

    # =========================================================================
    # 3. Compilar
    # =========================================================================
    compiled = graph.compile()

    logger.info(f"[{ctx.workflow_id}] Pipeline graph compiled successfully")

    return compiled
