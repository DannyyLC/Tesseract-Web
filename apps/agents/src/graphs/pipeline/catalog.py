"""
Catálogo de tipos de nodo del pipeline — autodescripción del motor.

Cada tipo de nodo declara su JSON Schema de config y sus puertos. El catálogo se
expone vía el RPC GetNodeCatalog para que el Gateway valide workflows al
guardarlos y para que el futuro editor visual renderice formularios y paletas de
nodos sin duplicar conocimiento del motor.

La evolución es SOLO ADITIVA (ver <repo>/docs/reference/pipeline-graph-schema.md).
"""

from typing import Any, Dict

from graphs.pipeline.state import SUPPORTED_SCHEMA_VERSION

_CONDITION_RULE_SCHEMA = {
    "type": "object",
    "properties": {
        "when": {
            "type": "object",
            "properties": {
                "field": {"type": "string", "description": "Path en el estado (variables.x / context.x)"},
                "op": {"type": "string", "enum": ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "in"]},
                "value": {"description": "Valor a comparar (soporta templates)"},
            },
            "required": ["field"],
        },
        "goto": {"type": "string", "description": "ID del nodo destino"},
    },
    "required": ["when", "goto"],
}

_DISABLE_TOOLS_RULE_SCHEMA = {
    "type": "object",
    "properties": {
        "tool": {"type": "string", "description": "Nombre de la tool (base o completo); ausente = todas"},
        "field": {"type": "string"},
        "op": {"type": "string", "enum": ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "in"]},
        "value": {},
    },
    "required": ["field"],
}

NODE_TYPES: Dict[str, Dict[str, Any]] = {
    "agent": {
        "label": "Agente",
        "description": "Llama al LLM del agente configurado. Con max_iterations>0 entra en modo agéntico (loop LLM↔tools).",
        "ports": {"inputs": ["in"], "outputs": ["out"]},
        "config_schema": {
            "type": "object",
            "properties": {
                "agent": {"type": "string", "description": "Clave en agents_config"},
                "max_iterations": {"type": "integer", "minimum": 0, "default": 0},
                "output_variable": {"type": "string"},
                "classification_pattern": {"type": "string", "description": "Regex para extraer intents"},
                "silent": {"type": "boolean", "default": False,
                           "description": "Nodo interno: respuesta solo a output_variable, sin mensaje al usuario"},
                "system_prompt_extra": {"type": "string", "description": "Template sumado al system prompt"},
                "disable_tools_if": {"type": "array", "items": _DISABLE_TOOLS_RULE_SCHEMA},
                "set_variables_on_tool_call": {
                    "type": "object",
                    "additionalProperties": {"type": "object"},
                    "description": "{tool: {variable: valor}} al llamar la tool",
                },
            },
            "required": ["agent"],
        },
    },
    "tool": {
        "label": "Tool",
        "description": "Ejecuta una función de una tool instance directamente, sin LLM. Params con templates.",
        "ports": {"inputs": ["in"], "outputs": ["out"]},
        "config_schema": {
            "type": "object",
            "properties": {
                "tool_instance": {"type": "string", "description": "UUID del TenantTool"},
                "function": {"type": "string"},
                "params": {"type": "object", "description": "Parámetros (soportan templates)"},
                "output_variable": {"type": "string"},
                "parse_json_result": {
                    "type": "boolean", "default": False,
                    "description": "Guarda el resultado JSON ya parseado, para que las condiciones lean campos anidados",
                },
                "append_result_to_messages": {
                    "type": "boolean", "default": True,
                    "description": "False = el resultado no entra al historial (no lo ve ningún LLM posterior)",
                },
            },
            "required": ["tool_instance", "function"],
        },
    },
    "set_variables": {
        "label": "Set Variables",
        "description": "Setea variables en el estado sin llamar al LLM.",
        "ports": {"inputs": ["in"], "outputs": ["out"]},
        "config_schema": {
            "type": "object",
            "properties": {
                "variables": {"type": "object", "description": "Variables a setear (valores con templates)"},
                "append_system_message": {"type": "string"},
            },
        },
    },
    "condition": {
        "label": "Condición",
        "description": "Bifurca el flujo. Sus salidas son puertos nombrados (branches/rules/routes).",
        "ports": {"inputs": ["in"], "outputs": "dynamic"},
        "config_schema": {
            "type": "object",
            "properties": {
                "mode": {"type": "string", "enum": ["switch", "rules", "router"], "default": "switch"},
                "source": {"type": "string", "description": "switch: path a evaluar"},
                "branches": {"type": "object", "additionalProperties": {"type": "string"},
                             "description": "switch: {valor: nodo destino}; 'default' obligatorio"},
                "rules": {"type": "array", "items": _CONDITION_RULE_SCHEMA},
                "default": {"type": "string", "description": "rules: destino si ninguna matchea"},
                "route_variable": {"type": "string", "description": "router: path del intent"},
                "routes": {"type": "object", "additionalProperties": {"type": "string"}},
                "fallback": {"type": "string"},
                "max_reroutes": {"type": "integer", "default": 3},
                "lock_node": {"type": "string"},
                "max_parallel_agents": {"type": "integer", "default": 3},
                "synthesizer_node": {"type": "string"},
                "end_node": {"type": "string", "description": "router: nodo de fin de turno en vez de END"},
            },
            "required": ["mode"],
        },
    },
    "synthesizer": {
        "label": "Sintetizador",
        "description": "Convergencia del fan-out: combina las respuestas de los especialistas en una sola.",
        "ports": {"inputs": ["in"], "outputs": ["out"]},
        "config_schema": {
            "type": "object",
            "properties": {
                "agent": {"type": "string", "description": "Clave en agents_config", "default": "synthesizer"},
                "config": {
                    "type": "object",
                    "properties": {
                        "set_variables": {"type": "object"},
                        "system_prompt_extra": {"type": "string"},
                    },
                },
            },
        },
    },
}


def get_node_catalog() -> Dict[str, Any]:
    """
    Catálogo completo del pipeline: tipos de nodo, contrato de templates y
    metadatos del schema. Es la fuente de verdad para validar workflows y para
    el editor visual.
    """
    return {
        "graph_type": "pipeline",
        "schema_version": SUPPORTED_SCHEMA_VERSION,
        "node_types": {
            name: {
                "type": name,
                "label": meta["label"],
                "description": meta["description"],
                "ports": meta["ports"],
                "config_schema": meta["config_schema"],
            }
            for name, meta in NODE_TYPES.items()
        },
        "templates": {
            "syntax": "{{path}}",
            "namespaces": {
                "variables": "Bus de datos del pipeline (state.variables)",
                "context": "TenantContext de solo lectura: user_metadata.*, channel, timezone, user_id, conversation_id, tenant_id, workflow_id, user_type",
            },
            "note": "Los namespaces desconocidos se dejan literales (p.ej. {{1}} de plantillas Meta).",
        },
        "graph_config_keys": {
            "persist_variables": "Claves de variables que el Gateway persiste entre turnos",
            "variable_reducers": "Semántica de merge por variable: {var: {mode: join|append|last, separator}}",
            "schema_version": f"Versión del contrato (default 1, máximo {SUPPORTED_SCHEMA_VERSION})",
        },
        "edge_forms": [
            {"from": "nodo|START", "to": "nodo|END"},
            {"from": "condition", "output": "puerto", "to": "nodo",
             "note": "Forma con puerto para el editor; el ruteo real lo define la config de la condition"},
        ],
    }
