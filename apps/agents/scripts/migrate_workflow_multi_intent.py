#!/usr/bin/env python3
"""
Migra la config de un workflow pipeline con router single-intent al esquema
multi-intent con fan-out paralelo + synthesizer.

Transformaciones (genéricas, ver docs/reference/pendientes-pipeline-engine.md):
  1. Nodo router: agrega lock_node (si se pasa --lock-node), max_parallel_agents
     y synthesizer_node.
  2. classification_pattern de los nodos agent: \\[ROUTE:(\\w+)\\] →
     \\[ROUTE:([\\w,\\s]+)\\] (acepta lista con comas; los tags repetidos ya
     funcionaban).
  3. Cada nodo agent con tools interceptables: agrega intercept_tools_in_parallel.
  4. Nodo nuevo: synthesize (synthesizer) + edge synthesize → END. Los
     especialistas conservan su edge al router: el propio router detecta
     "outputs sin sintetizar y nada pendiente" y converge en el synthesizer.
  5. Agente "synthesizer" en config.agents (modelo/prompt por defecto editables).

Uso:
    python migrate_workflow_multi_intent.py config.json > config_nuevo.json
    python migrate_workflow_multi_intent.py config.json --sql --workflow-id <uuid> > update.sql

La entrada es el JSON completo de la columna workflows.config.
"""

import argparse
import json
import sys

LEGACY_PATTERN = "\\[ROUTE:(\\w+)\\]"
MULTI_PATTERN = "\\[ROUTE:([\\w,\\s]+)\\]"

SYNTHESIZER_PROMPT = (
    "Eres el sintetizador de respuestas. Recibes las respuestas de varios "
    "especialistas a un mismo mensaje del usuario (en el bloque RESPUESTAS DE LOS "
    "ESPECIALISTAS) y debes combinarlas en UNA sola respuesta coherente, sin "
    "repetir información y sin mencionar que existen especialistas o sistemas "
    "internos. Mantén el tono y las reglas de formato de los especialistas: sin "
    "emojis, sin símbolos de markdown como ##; usa **negritas** para títulos y "
    "- para listas."
)


def migrate(config: dict, router_id: str, intercept_tools: list[str],
            max_parallel: int, lock_node: str | None) -> dict:
    config = json.loads(json.dumps(config))  # deep copy
    graph = config["graph"]
    nodes = graph["nodes"]
    edges = graph["edges"]
    nodes_by_id = {n["id"]: n for n in nodes}

    router = nodes_by_id[router_id]
    router_cfg = router["config"]
    if lock_node:
        router_cfg["lock_node"] = lock_node
    router_cfg["max_parallel_agents"] = max_parallel
    router_cfg["synthesizer_node"] = "synthesize"

    specialist_ids = set(router_cfg["routes"].values())

    for node in nodes:
        if node.get("type") != "agent":
            continue
        if node.get("classification_pattern") == LEGACY_PATTERN:
            node["classification_pattern"] = MULTI_PATTERN
        if node["id"] in specialist_ids and intercept_tools:
            node["intercept_tools_in_parallel"] = intercept_tools

    if "synthesize" not in nodes_by_id:
        nodes.append({
            "id": "synthesize",
            "type": "synthesizer",
            "agent": "synthesizer",
            "config": {
                "execute_pending_handoffs": True,
                "handoff_notice": (
                    "Ya se envió una notificación consolidada al equipo; no digas "
                    "que enviarás otra ni que 'te voy a conectar'."
                ),
            },
        })

    if not any(e["from"] == "synthesize" for e in edges):
        edges.append({"from": "synthesize", "to": "END"})

    agents = config.setdefault("agents", {})
    if "synthesizer" not in agents:
        # Mismo modelo que el primer agente existente
        first_agent = next(iter(agents.values()), {})
        agents["synthesizer"] = {
            "model": first_agent.get("model", "gpt-4o"),
            "temperature": 0.5,
            "system_prompt": SYNTHESIZER_PROMPT,
        }

    return config


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config_file", help="JSON de la columna workflows.config")
    parser.add_argument("--router-id", default="check_route")
    parser.add_argument("--intercept-tools", default="send_bulk_whatsapp",
                        help="Nombres base separados por coma ('' para ninguno)")
    parser.add_argument("--max-parallel", type=int, default=3)
    parser.add_argument("--lock-node", default=None,
                        help="ID del nodo set_variables de lock (p.ej. lock_routing)")
    parser.add_argument("--sql", action="store_true",
                        help="Emitir UPDATE SQL en vez del JSON")
    parser.add_argument("--workflow-id", default=None, help="UUID para el UPDATE")
    args = parser.parse_args()

    with open(args.config_file) as f:
        config = json.load(f)

    intercept = [t for t in args.intercept_tools.split(",") if t.strip()]
    new_config = migrate(config, args.router_id, intercept,
                         args.max_parallel, args.lock_node)

    if args.sql:
        if not args.workflow_id:
            sys.exit("--sql requiere --workflow-id")
        payload = json.dumps(new_config, ensure_ascii=False).replace("'", "''")
        print(f"UPDATE workflows SET config = '{payload}'::jsonb, "
              f"\"updatedAt\" = NOW() WHERE id = '{args.workflow_id}';")
    else:
        print(json.dumps(new_config, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
