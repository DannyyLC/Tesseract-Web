# Contrato del schema de `graph_config` (pipeline)

Este documento define el contrato entre los workflows guardados en DB, el motor
(`apps/agents`) y el futuro editor visual. **El JSON del grafo ES el contrato**:
el editor leerá y escribirá el mismo JSON que el motor ejecuta.

## Regla de oro: evolución SOLO ADITIVA

- Toda capacidad nueva es una **clave opcional nueva** cuyo default preserva el
  comportamiento anterior.
- Nunca se renombra ni elimina una clave que un workflow guardado pueda usar.
- Si un cambio rompedor fuera inevitable: se incrementa `schema_version`, el
  motor sigue soportando la versión anterior (o un script migra los workflows en
  DB). Un workflow guardado jamás deja de funcionar en silencio.

```json
{ "type": "pipeline", "schema_version": 1, "nodes": [...], "edges": [...] }
```

`schema_version` ausente = 1. El motor rechaza versiones mayores a la soportada
(`SUPPORTED_SCHEMA_VERSION` en `graphs/pipeline_agent.py`).

## Estructura raíz

| Clave | Tipo | Descripción |
|---|---|---|
| `type` | string | Tipo de grafo (`pipeline`, `react`, ...) — decide el builder |
| `schema_version` | int (opc) | Versión del contrato (default 1) |
| `nodes` | list | Nodos del grafo (ver tipos abajo) |
| `edges` | list | Aristas (ver formas abajo) |
| `persist_variables` | list (opc) | Claves de `variables` que el Gateway persiste entre turnos |
| `variable_reducers` | dict (opc) | Semántica de merge por variable (ver abajo) |

## Aristas

Dos formas válidas:

1. **Clásica**: `{"from": "nodo|START", "to": "nodo|END"}` — arista estática.
2. **Con puerto** (la que emitirá el editor): `{"from": "<condition>", "output": "<puerto>", "to": "nodo"}`.
   Las aristas cuyo `from` es un nodo condition son DECLARATIVAS: documentan la
   conexión de cada puerto de salida para que el editor la dibuje, pero el ruteo
   real lo resuelve la config de la condition (branches/rules/routes). El motor
   las acepta y las ignora al compilar.

## Catálogo de nodos (autodescripción del motor)

`graphs/pipeline/catalog.py` → `get_node_catalog()` expone tipos de nodo con su
JSON Schema de config y puertos, vía el RPC `GetNodeCatalog` y el endpoint del
Gateway `GET /workflows/node-catalog`. El Gateway valida los workflows contra el
catálogo al guardarlos; el editor futuro consume el mismo endpoint para renderizar
la paleta de nodos y los formularios.

## `variable_reducers`

Declara cómo se combinan las escrituras concurrentes/secuenciales de una
variable. Sin declarar → `last` (la escritura nueva gana), el comportamiento
clásico.

```json
"variable_reducers": {
  "handoff_topics": {"mode": "join", "separator": ", "},
  "media_url":      {"mode": "join", "separator": ","},
  "eventos":        {"mode": "append"}
}
```

- `join`: une valores en un string con `separator`, deduplicando y descartando
  vacíos. Sobrevive a escrituras de ramas paralelas. Escribir `null` resetea.
- `append`: acumula en lista.
- `last`: default.

## Tipos de nodo

### `agent`
Llama al LLM del agente declarado en `agents_config`.

| Clave | Descripción |
|---|---|
| `agent` | Clave en `agents_config` |
| `max_iterations` | >0 activa el modo agéntico (loop LLM↔tools) |
| `output_variable` | Guarda la respuesta (o el intent extraído) en `variables` |
| `classification_pattern` | Regex para extraer tags de ruteo de la respuesta |
| `silent` | `true` = nodo interno: respuesta SOLO a `output_variable`, sin mensaje al usuario ni streaming |
| `system_prompt_extra` | Template sumado al system prompt en cada ejecución (vacío al resolver → no agrega nada) |
| `disable_tools_if` | Reglas deterministas para no bindear tools según el estado |
| `set_variables_on_tool_call` | `{tool: {var: valor}}` — variables deterministas al llamar la tool |

### `tool`
Ejecuta una función de una tool instance directamente, sin LLM. `params`
soporta templates.

### `condition`
Nodo de PRIMERA CLASE con puertos de salida. Modos: `switch` (campo → branches),
`rules` (primera regla que matchea), `router` (ruteo multi-intent con fan-out,
`fallback`, `lock_node`, `synthesizer_node`, `end_node`).

- `end_node` (router): nodo al que ir en vez de END al terminar el turno — punto
  único de finalización para colgar cadenas post-turno.

### `set_variables`
Setea variables (con templates) sin llamar al LLM.

### `synthesizer`
Convergencia del fan-out: combina `specialist_outputs` en una respuesta única.
Config: `set_variables` (al terminar), `system_prompt_extra`.

## Templates

Sintaxis `{{path}}`, disponibles en: params de nodos tool, valores de
`set_variables`, `system_prompt` y `system_prompt_extra` de agentes, valores de
reglas de condiciones.

- `{{variables.x}}` — bus de datos del pipeline. Template completo preserva el
  tipo original (lista, dict, número); inline interpola como string.
- `{{context.x}}` — TenantContext de solo lectura: `user_metadata.*`, `channel`,
  `timezone`, `user_id`, `conversation_id`, `tenant_id`, `workflow_id`, `user_type`.
- Namespaces desconocidos (p.ej. `{{1}}` en un prompt con placeholders de Meta)
  se dejan **literales** — nunca se reemplazan por vacío.

## Signal tools (declaradas en `agents_config`)

Tools sin efectos definidas por config — el LLM "marca" cosas y el efecto real lo
produce `set_variables_on_tool_call` + el grafo:

```json
"agents": {
  "ventas": {
    "signal_tools": [{
      "name": "solicitar_asesor",
      "description": "Llama esto cuando el cliente pida hablar con un humano.",
      "args": {"detalle": "Nota breve del contexto"},
      "response": "Solicitud registrada."
    }]
  }
}
```

## Panel de variables (para el editor)

Las variables disponibles de un workflow se derivan estáticamente de su propio
JSON: todo `output_variable`, las claves de `set_variables` y
`set_variables_on_tool_call`, y `persist_variables` — más el namespace
`context.*` (schema fijo). No se necesita nada del motor en runtime.
