"""
Ruteo multi-intent del pipeline: extracción/normalización de intents y el modo
"router" de los nodos condition (single, fan-out paralelo con Send, anti-loop).
"""

import logging
import re
from typing import Dict, List

from langgraph.graph import END
from langgraph.types import Send

from core.context import TenantContext
from graphs.pipeline.templating import resolve_path

logger = logging.getLogger(__name__)


def extract_intents(pattern: re.Pattern, content: str) -> tuple[List[str], str]:
    """
    Extrae TODOS los intents de una respuesta y limpia los tags del texto visible.

    Soporta ambos formatos de emisión:
        - Tags repetidos:       "[ROUTE:a] [ROUTE:b]"
        - Lista con comas:      "[ROUTE:a,b]"   (el regex debe permitir comas en el grupo)

    Returns:
        (intents normalizados y deduplicados preservando orden, content sin tags)
    """
    intents: List[str] = []
    for group in pattern.findall(content):
        for part in str(group).split(","):
            p = part.strip().lower()
            if p and p not in intents:
                intents.append(p)
    cleaned = pattern.sub("", content).strip()
    return intents, cleaned


def normalize_intents(value) -> List[str]:
    """
    Normaliza el valor de la variable de ruteo a lista de intents.

    Retrocompatible: acepta lista, string único ("ventas"), string con comas
    ("ventas,soporte") o None. Dedup preservando orden.
    """
    if value is None:
        return []
    if isinstance(value, str):
        raw_parts = value.split(",")
    elif isinstance(value, list):
        raw_parts = value
    else:
        raw_parts = [value]

    out: List[str] = []
    for part in raw_parts:
        p = str(part).strip().lower()
        if p and p not in out:
            out.append(p)
    return out


def make_router_condition(node_id: str, config: Dict, ctx: TenantContext):
    """
    Router conversacional con anti-loop y soporte multi-intent.

    Rutea según un intent persistido (string legacy o lista de intents) y usa
    execution_path para saber qué agentes ya respondieron en este ciclo.

    - 1 intent nuevo y sin outputs previos → retorna el nombre del nodo (string):
      modo single, ruta idéntica al comportamiento clásico.
    - 2+ intents (o 1 nuevo habiendo outputs previos que reutilizar) → retorna
      list[Send]: fan-out paralelo con parallel_mode=True; los especialistas
      escriben a specialist_outputs y convergen en el synthesizer.

    Config:
        route_variable:      path del intent (p.ej. "variables.intent")
        routes:              {intent: node_id}
        fallback:            nodo cuando no hay intents válidos (p.ej. clasificador)
        max_reroutes:        tope de re-clasificaciones por turno (default 3)
        lock_node:           nodo de lock al agotar max_reroutes (opcional)
        max_parallel_agents: tope de ramas paralelas por mensaje (default 3)
        synthesizer_node:    nodo de convergencia del fan-out
        end_node:            nodo al que ir en vez de END al terminar el turno
                             (punto único de finalización — permite colgar cadenas
                             post-turno tanto en modo single como tras el lock)
    """
    route_variable = config["route_variable"]
    routes = config["routes"]
    fallback = config.get("fallback", END)
    max_reroutes = config.get("max_reroutes", 3)
    lock_node = config.get("lock_node")
    max_parallel_agents = config.get("max_parallel_agents", 3)
    synthesizer_node = config.get("synthesizer_node")
    end_node = config.get("end_node")

    def router_condition(state):
        variables = state.get("variables", {})
        execution_path = state.get("execution_path", [])
        reroute_count = variables.get("reroute_count", 0)
        outputs_count = len(state.get("specialist_outputs", []))

        def finish():
            """Salida de fin de turno: end_node configurado (una sola vez) o END."""
            if end_node and end_node not in execution_path:
                logger.info(
                    f"[{ctx.workflow_id}] Router '{node_id}': fin de turno → "
                    f"end_node '{end_node}'"
                )
                return end_node
            return END

        # Convergencia del fan-out: si hay specialist_outputs, un fan-out ya corrió
        # en este turno y la ÚNICA salida válida es el synthesizer (o el cierre).
        if outputs_count:
            if synthesizer_node and synthesizer_node not in execution_path:
                logger.info(
                    f"[{ctx.workflow_id}] Router '{node_id}': fan-out completado "
                    f"({outputs_count} output(s) visibles) → '{synthesizer_node}'"
                )
                return synthesizer_node
            return finish()

        intents = normalize_intents(resolve_path(state, route_variable, ctx))
        valid_intents = [i for i in intents if i in routes]

        # Targets únicos preservando orden, con el intent que originó cada uno
        intent_by_target: Dict[str, str] = {}
        for intent in valid_intents:
            target = routes[intent]
            if target not in intent_by_target:
                intent_by_target[target] = intent

        pending = [t for t in intent_by_target if t not in execution_path][:max_parallel_agents]

        # Anti-loop: máximo de re-ruteos alcanzado
        if reroute_count >= max_reroutes and lock_node:
            if lock_node not in execution_path:
                logger.warning(
                    f"[{ctx.workflow_id}] Router '{node_id}': max_reroutes ({max_reroutes}) "
                    f"alcanzado → '{lock_node}'"
                )
                return lock_node
            logger.info(f"[{ctx.workflow_id}] Router '{node_id}': lock ya en path → fin de turno")
            return finish()

        # Sin intents válidos → fallback (p.ej. classifier)
        if not valid_intents:
            if fallback in execution_path:
                logger.info(
                    f"[{ctx.workflow_id}] Router '{node_id}': fallback '{fallback}' ya en path → fin de turno"
                )
                return finish()
            logger.info(
                f"[{ctx.workflow_id}] Router '{node_id}': intents={intents} → fallback '{fallback}'"
            )
            return fallback

        if not pending:
            logger.info(
                f"[{ctx.workflow_id}] Router '{node_id}': targets ya en path → fin de turno"
            )
            return finish()

        if len(pending) == 1 and outputs_count == 0:
            # Modo single: el especialista escribe a messages, streaming intacto,
            # tools reales directas.
            target_node = pending[0]
            logger.info(
                f"[{ctx.workflow_id}] Router '{node_id}': "
                f"intent='{intent_by_target[target_node]}' → '{target_node}' (single)"
            )
            return target_node

        # Modo paralelo: fan-out con Send. parallel_mode viaja en el input de cada
        # rama (no es una escritura de estado); el synthesizer combina los outputs.
        logger.info(
            f"[{ctx.workflow_id}] Router '{node_id}': fan-out paralelo → {pending} "
            f"(intents={valid_intents}, outputs previos={outputs_count})"
        )
        return [
            Send(target, {
                **state,
                "parallel_mode": True,
                "current_intent": intent_by_target[target],
            })
            for target in pending
        ]

    return router_condition
