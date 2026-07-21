"""
Condiciones del pipeline: evaluación de operadores y las fábricas de los modos
"switch" y "rules". El modo "router" vive en routing.py.
"""

import logging
from typing import Any, Dict

from langgraph.graph import END

from core.context import TenantContext
from graphs.pipeline.routing import make_router_condition
from graphs.pipeline.templating import render_template_value, resolve_path

logger = logging.getLogger(__name__)


def evaluate_condition(op: str, field_value: Any, compare_value: Any) -> bool:
    """
    Evalúa una operación de comparación para condiciones tipo 'rules'.

    Operaciones soportadas:
        eq       → field_value == compare_value
        neq      → field_value != compare_value
        gt       → field_value >  compare_value
        gte      → field_value >= compare_value
        lt       → field_value <  compare_value
        lte      → field_value <= compare_value
        contains → compare_value in str(field_value)
        in       → field_value in compare_value (compare_value debe ser lista)
    """
    try:
        if op == "eq":       return field_value == compare_value
        if op == "neq":      return field_value != compare_value
        if op == "gt":       return field_value > compare_value
        if op == "gte":      return field_value >= compare_value
        if op == "lt":       return field_value < compare_value
        if op == "lte":      return field_value <= compare_value
        if op == "contains": return compare_value in str(field_value)
        if op == "in":       return field_value in compare_value
    except (TypeError, ValueError):
        return False

    logger.warning(f"Operador de condición desconocido: '{op}'")
    return False


def make_condition_function(node_id: str, config: Dict[str, Any], ctx: TenantContext):
    """
    Crea la función de condición para los conditional edges de un nodo condition.

    La función retorna el ID del nodo destino según el estado actual.

    Modos soportados:

    1. switch — Evalúa un campo del estado contra un mapa de ramas:
       {"mode": "switch", "source": "variables.intent",
        "branches": {"ventas": "node_sales", "default": "node_generic"}}

    2. rules — Evalúa reglas en orden, usa la primera que hace match:
       {"mode": "rules",
        "rules": [{"when": {"field": "variables.score", "op": "gte", "value": 0.8},
                   "goto": "node_vip"}],
        "default": "node_standard"}
       Los valores de las reglas soportan templates {{variables.x}}/{{context.x}}.

    3. router — Ruteo multi-intent con fan-out (ver routing.make_router_condition).
    """
    mode = config.get("mode", "switch")

    if mode == "switch":
        source = config["source"]
        branches = config["branches"]

        def switch_condition(state) -> str:
            value = resolve_path(state, source, ctx)
            value_str = str(value).strip() if value is not None else ""

            destination = branches.get(value_str) or branches.get("default")

            if not destination:
                logger.error(
                    f"[{ctx.workflow_id}] Condition node '{node_id}': "
                    f"no branch matched for value '{value_str}' and no 'default' defined"
                )
                return END

            logger.info(
                f"[{ctx.workflow_id}] Condition node '{node_id}': "
                f"'{source}' = '{value_str}' → '{destination}'"
            )
            return destination

        return switch_condition

    elif mode == "rules":
        rules = config.get("rules", [])
        default = config.get("default", END)

        def rules_condition(state) -> str:
            for rule in rules:
                when = rule.get("when", {})
                field_value = resolve_path(state, when.get("field", ""), ctx)
                op = when.get("op", "eq")
                compare_value = render_template_value(when.get("value"), state, ctx)

                if evaluate_condition(op, field_value, compare_value):
                    destination = rule["goto"]
                    logger.info(
                        f"[{ctx.workflow_id}] Condition node '{node_id}': "
                        f"rule matched ({when['field']} {op} {compare_value}) → '{destination}'"
                    )
                    return destination

            logger.info(
                f"[{ctx.workflow_id}] Condition node '{node_id}': "
                f"no rules matched → default '{default}'"
            )
            return default

        return rules_condition

    elif mode == "router":
        return make_router_condition(node_id, config, ctx)

    else:
        raise ValueError(
            f"[{ctx.workflow_id}] Condition node '{node_id}': "
            f"mode desconocido '{mode}'. Usar 'switch', 'rules' o 'router'."
        )
