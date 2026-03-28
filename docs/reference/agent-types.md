---
title: 'Tipos de Agente'
description: 'Referencia completa de los tipos de grafo disponibles y cómo configurarlos.'
---

El campo `config.graph.type` de un Workflow determina qué tipo de grafo ejecuta el servicio de agentes. Actualmente hay dos tipos disponibles: `react` y `pipeline`.

---

## `react` — Agente ReAct

**Cuándo usarlo:** Para la mayoría de los casos. El LLM razona libremente, decide qué tools usar y en qué orden, y responde cuando tiene suficiente información.

**Cómo funciona:** El LLM recibe el mensaje del usuario y las tools disponibles. Si necesita información adicional, llama una tool, recibe el resultado, y puede llamar otra. Repite hasta tener una respuesta final. El flujo lo controla el LLM, no la config.

### Configuración

```json
{
  "type": "agent",
  "graph": {
    "type": "react",
    "config": {
      "max_iterations": 10,
      "allow_interrupts": false
    }
  },
  "agents": {
    "default": {
      "model": "gpt-4o",
      "temperature": 0.7,
      "system_prompt": "Eres un asistente de ventas...",
      "tools": ["uuid-tenant-tool-1", "uuid-tenant-tool-2"]
    }
  }
}
```

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `max_iterations` | int | 10 | Límite de ciclos LLM→tool para prevenir loops infinitos |
| `allow_interrupts` | bool | false | Si `true`, pausa antes de ejecutar tools (human-in-the-loop) |
| `agents.default.model` | string | — | Modelo a usar (cualquier modelo soportado por LiteLLM) |
| `agents.default.temperature` | float | 0.7 | Temperatura del LLM |
| `agents.default.system_prompt` | string | — | Instrucciones base del agente |
| `agents.default.tools` | string[] | [] | UUIDs de TenantTools habilitadas para este agente |

### Ejemplo completo

Un agente que puede agendar citas en Google Calendar y escalar a humano:

```json
{
  "type": "agent",
  "graph": {
    "type": "react",
    "config": { "max_iterations": 8 }
  },
  "agents": {
    "default": {
      "model": "gpt-4o",
      "temperature": 0.5,
      "system_prompt": "Eres un asistente que agenda citas. Siempre confirma la disponibilidad antes de crear un evento.",
      "tools": ["uuid-google-calendar", "uuid-human-handoff"]
    }
  }
}
```

---

## `pipeline` — Flujo explícito por nodos

**Cuándo usarlo:** Cuando necesitas controlar exactamente qué ocurre y en qué orden: clasificar antes de responder, ejecutar una tool antes de llamar al LLM, enrutar a diferentes agentes según la intención, o post-procesar la respuesta.

**Cómo funciona:** El flujo está definido en la config como una lista de nodos y sus conexiones. Cada nodo tiene un tipo y una responsabilidad específica. El LLM no controla el flujo — lo hace la config.

### Tipos de nodo

#### `agent` — Llama al LLM

Ejecuta el LLM una vez y avanza al siguiente nodo. Opcionalmente guarda la respuesta en `variables` para que nodos posteriores la usen.

```json
{
  "id": "classify",
  "type": "agent",
  "agent": "classifier",
  "output_variable": "intent"
}
```

| Campo | Requerido | Descripción |
|---|---|---|
| `id` | Sí | Identificador único del nodo en este grafo |
| `agent` | Sí | Clave en `agents` de la config (ej: `"default"`, `"classifier"`) |
| `output_variable` | No | Si se especifica, guarda el texto de la respuesta en `variables[output_variable]` |

---

#### `tool` — Ejecuta una tool directamente (sin LLM)

Llama a una función de una tool del tenant con los parámetros dados. Los parámetros pueden ser fijos o extraídos de `variables` usando templates `{{variables.x}}`.

```json
{
  "id": "buscar_perfil",
  "type": "tool",
  "config": {
    "tool_instance": "uuid-del-tenant-tool",
    "function": "get_contact",
    "params": {
      "phone": "{{variables.user_phone}}",
      "source": "whatsapp"
    },
    "output_variable": "user_profile"
  }
}
```

| Campo | Requerido | Descripción |
|---|---|---|
| `tool_instance` | Sí | UUID del TenantTool configurado en la organización |
| `function` | Sí | Nombre de la función específica a ejecutar |
| `params` | No | Parámetros de la función. Soporta templates `{{variables.x}}` |
| `output_variable` | No | Si se especifica, guarda el resultado en `variables[output_variable]` |

**Templates de parámetros:**

Los valores `{{variables.x}}` se reemplazan con el valor real de `state.variables` en tiempo de ejecución.

```json
{
  "phone": "{{variables.user_phone}}",
  "message": "Hola {{variables.name}}, tu cita es el {{variables.date}}",
  "fixed_value": "siempre_este_valor"
}
```

---

#### `condition` — Enruta a una rama según el estado

No se ejecuta como nodo — LangGraph lo convierte en un conditional edge. Lee `state.variables` y decide a qué nodo ir.

**Modo `switch`** — Compara un valor contra un mapa de ramas:

```json
{
  "id": "route",
  "type": "condition",
  "config": {
    "mode": "switch",
    "source": "variables.intent",
    "branches": {
      "ventas":   "node_sales",
      "soporte":  "node_support",
      "factura":  "node_billing",
      "default":  "node_generic"
    }
  }
}
```

**Modo `rules`** — Evalúa reglas en orden, usa la primera que hace match:

```json
{
  "id": "priority_route",
  "type": "condition",
  "config": {
    "mode": "rules",
    "rules": [
      { "when": { "field": "variables.plan",  "op": "eq",  "value": "enterprise" }, "goto": "node_vip"      },
      { "when": { "field": "variables.score", "op": "gte", "value": 0.8          }, "goto": "node_priority" }
    ],
    "default": "node_standard"
  }
}
```

Operadores disponibles para `rules`:

| Operador | Descripción | Ejemplo |
|---|---|---|
| `eq` | Igual | `plan == "pro"` |
| `neq` | Diferente | `status != "active"` |
| `gt` | Mayor que | `score > 0.8` |
| `gte` | Mayor o igual | `score >= 0.5` |
| `lt` | Menor que | `age < 18` |
| `lte` | Menor o igual | `retries <= 3` |
| `contains` | Contiene substring | `"urgente" in message` |
| `in` | Está en lista | `plan in ["pro", "enterprise"]` |

---

### Configuración completa de un pipeline

Estructura del `config.graph` en la DB:

```json
{
  "type": "pipeline",
  "nodes": [...],
  "edges": [...]
}
```

Las `edges` definen las conexiones entre nodos. Usar `"START"` y `"END"` como nodos especiales:

```json
"edges": [
  { "from": "START",       "to": "primer_nodo" },
  { "from": "primer_nodo", "to": "segundo_nodo" },
  { "from": "ultimo_nodo", "to": "END"          }
]
```

Cuando una edge apunta a un nodo de tipo `condition`, el sistema lo convierte automáticamente en un `add_conditional_edges` de LangGraph. No es necesario declarar las edges de salida de un nodo condition — esas están definidas en sus `branches`.

---

### Ejemplo 1: Clasificar y enrutar

El agente clasificador escribe la intención en `variables.intent`. El nodo condition la lee y enruta al agente correcto.

```json
{
  "type": "agent",
  "graph": {
    "type": "pipeline",
    "nodes": [
      {
        "id": "classify",
        "type": "agent",
        "agent": "classifier",
        "output_variable": "intent"
      },
      {
        "id": "route",
        "type": "condition",
        "config": {
          "mode": "switch",
          "source": "variables.intent",
          "branches": {
            "ventas":  "node_sales",
            "soporte": "node_support",
            "default": "node_generic"
          }
        }
      },
      { "id": "node_sales",   "type": "agent", "agent": "sales"   },
      { "id": "node_support", "type": "agent", "agent": "support" },
      { "id": "node_generic", "type": "agent", "agent": "default" }
    ],
    "edges": [
      { "from": "START",       "to": "classify"     },
      { "from": "classify",    "to": "route"        },
      { "from": "node_sales",  "to": "END"          },
      { "from": "node_support","to": "END"          },
      { "from": "node_generic","to": "END"          }
    ]
  },
  "agents": {
    "classifier": {
      "model": "gpt-4o-mini",
      "temperature": 0,
      "system_prompt": "Clasifica la intención del usuario. Responde SOLO con una palabra: ventas, soporte, o default."
    },
    "sales": {
      "model": "gpt-4o",
      "temperature": 0.7,
      "system_prompt": "Eres un experto en ventas..."
    },
    "support": {
      "model": "gpt-4o",
      "temperature": 0.5,
      "system_prompt": "Eres un agente de soporte técnico..."
    },
    "default": {
      "model": "gpt-4o",
      "temperature": 0.7,
      "system_prompt": "Eres un asistente general..."
    }
  }
}
```

---

### Ejemplo 2: Enriquecer contexto antes del agente

Primero busca el perfil del usuario en HubSpot, luego el agente responde con esa información disponible en el historial de mensajes.

```json
{
  "type": "agent",
  "graph": {
    "type": "pipeline",
    "nodes": [
      {
        "id": "get_profile",
        "type": "tool",
        "config": {
          "tool_instance": "uuid-hubspot",
          "function": "get_contact",
          "params": { "phone": "{{variables.user_phone}}" },
          "output_variable": "user_profile"
        }
      },
      {
        "id": "respond",
        "type": "agent",
        "agent": "default"
      }
    ],
    "edges": [
      { "from": "START",       "to": "get_profile" },
      { "from": "get_profile", "to": "respond"     },
      { "from": "respond",     "to": "END"         }
    ]
  },
  "agents": {
    "default": {
      "model": "gpt-4o",
      "temperature": 0.7,
      "system_prompt": "Eres un asistente. Tienes acceso al perfil del usuario en el historial de mensajes."
    }
  }
}
```

---

## Diferencias clave entre `react` y `pipeline`

| | `react` | `pipeline` |
|---|---|---|
| **Flujo decidido por** | El LLM | La config |
| **Predecible** | No siempre | Sí |
| **Tools** | El LLM decide cuándo usarlas | Se ejecutan en nodos explícitos |
| **Multi-agente** | No nativo | Sí, con nodos `agent` y condiciones |
| **Cuándo usar** | Un agente con acceso a tools | Orquestación compleja, clasificación, pre/post procesamiento |
