---
title: 'Tipos de Agente'
description: 'Referencia completa de los tipos de grafo disponibles y cómo configurarlos.'
---

El campo `config.graph.type` de un Workflow determina qué tipo de grafo ejecuta el servicio de agentes. Hay cinco tipos disponibles: `react`, `pipeline`, `sequential`, `router` y `supervisor`.

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

---

## `sequential` — Cadena lineal de agentes

**Cuándo usarlo:** Cuando la tarea tiene etapas bien definidas que siempre se ejecutan en el mismo orden. Cada etapa tiene un rol distinto y se alimenta del contexto generado por las anteriores.

**Cómo funciona:** Los agentes se ejecutan en secuencia fija. El historial de mensajes se acumula entre pasos, así cada agente siguiente "ve" lo que respondieron los anteriores. No hay condiciones ni bifurcaciones.

### Configuración

```json
{
  "type": "agent",
  "graph": {
    "type": "sequential",
    "steps": [
      { "agent": "extractor",  "output_variable": "raw_data"  },
      { "agent": "analyzer",   "output_variable": "analysis"  },
      { "agent": "responder" }
    ]
  },
  "agents": {
    "extractor": {
      "model": "gpt-4o-mini",
      "temperature": 0,
      "system_prompt": "Extrae la información clave del mensaje del usuario en formato JSON."
    },
    "analyzer": {
      "model": "gpt-4o",
      "temperature": 0.3,
      "system_prompt": "Analiza la información extraída y genera un diagnóstico."
    },
    "responder": {
      "model": "gpt-4o",
      "temperature": 0.7,
      "system_prompt": "Con base en el análisis anterior, redacta una respuesta clara para el usuario."
    }
  }
}
```

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `steps` | array | Sí | Lista ordenada de pasos a ejecutar |
| `steps[].agent` | string | Sí | Clave en `agents` de la config |
| `steps[].output_variable` | string | No | Guarda el texto de la respuesta en `variables[output_variable]` para pasos posteriores |

### Ejemplo completo

Pipeline de análisis de contratos: extrae cláusulas, evalúa riesgos legales y genera un resumen ejecutivo.

```json
{
  "type": "agent",
  "graph": {
    "type": "sequential",
    "steps": [
      { "agent": "extractor",  "output_variable": "clausulas"    },
      { "agent": "legal",      "output_variable": "riesgos"      },
      { "agent": "summarizer"                                      }
    ]
  },
  "agents": {
    "extractor": {
      "model": "gpt-4o-mini",
      "temperature": 0,
      "system_prompt": "Eres un extractor de contratos. Identifica y lista todas las cláusulas relevantes del documento."
    },
    "legal": {
      "model": "gpt-4o",
      "temperature": 0.2,
      "system_prompt": "Eres un asesor legal. Evalúa los riesgos de las cláusulas identificadas en la conversación."
    },
    "summarizer": {
      "model": "gpt-4o",
      "temperature": 0.6,
      "system_prompt": "Eres un consultor ejecutivo. Redacta un resumen breve con las conclusiones del análisis legal para el cliente."
    }
  }
}
```

---

## `router` — Clasificación de intención + agente especializado

**Cuándo usarlo:** Cuando diferentes usuarios tienen necesidades radicalmente distintas y cada necesidad requiere un agente especializado con sus propias tools y system prompt.

**Cómo funciona:** Un agente clasificador ligero analiza el primer mensaje del usuario y devuelve una etiqueta de intención (ej: `"ventas"`). Un conditional edge enruta al agente especializado correspondiente, que ejecuta con su propio loop ReAct completo (incluyendo tools). Solo se activa un agente destino por conversación.

### Configuración

```json
{
  "type": "agent",
  "graph": {
    "type": "router",
    "classifier_agent": "classifier",
    "routes": {
      "ventas":  "sales",
      "soporte": "support",
      "default": "default"
    },
    "max_iterations": 10
  },
  "agents": {
    "classifier": {
      "model": "gpt-4o-mini",
      "temperature": 0,
      "system_prompt": "Clasifica la intención del usuario. Responde ÚNICAMENTE con una de estas palabras: ventas, soporte, default."
    },
    "sales": {
      "model": "gpt-4o",
      "temperature": 0.7,
      "system_prompt": "Eres un experto en ventas...",
      "tools": ["uuid-crm-tool"]
    },
    "support": {
      "model": "gpt-4o",
      "temperature": 0.5,
      "system_prompt": "Eres un agente de soporte técnico...",
      "tools": ["uuid-ticketing-tool", "uuid-human-handoff"]
    },
    "default": {
      "model": "gpt-4o",
      "temperature": 0.7,
      "system_prompt": "Eres un asistente general..."
    }
  }
}
```

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `classifier_agent` | string | Sí | Clave en `agents` del agente que clasifica la intención |
| `routes` | object | Sí | Mapa `intent_label → agent_name`. Debe incluir `"default"` como fallback |
| `max_iterations` | int | No (def: 10) | Límite del loop ReAct de los agentes destino |

**Notas importantes:**

- El `classifier_agent` debe responder con la etiqueta exacta definida en `routes`. Su `system_prompt` debe instruirlo explícitamente.
- La clave `"default"` en `routes` es **obligatoria**. Se usa cuando la intención no coincide con ninguna rama.
- Los agentes destino son loops ReAct completos — pueden tener tools, múltiples iteraciones, etc.
- Si varios intents apuntan al mismo agente (ej: `"ventas"` y `"upgrade"` → `"sales"`), el nodo se crea una sola vez.

### Ejemplo completo

Bot omnicanal para WhatsApp con tres especialidades:

```json
{
  "type": "agent",
  "graph": {
    "type": "router",
    "classifier_agent": "classifier",
    "routes": {
      "ventas":    "sales",
      "soporte":   "support",
      "factura":   "billing",
      "default":   "default"
    },
    "max_iterations": 8
  },
  "agents": {
    "classifier": {
      "model": "gpt-4o-mini",
      "temperature": 0,
      "system_prompt": "Analiza el mensaje del usuario y clasifica su intención. Responde SOLO con una palabra: ventas, soporte, factura, o default."
    },
    "sales": {
      "model": "gpt-4o",
      "temperature": 0.8,
      "system_prompt": "Eres un asesor comercial entusiasta. Tu objetivo es entender las necesidades del cliente y agendar una demo.",
      "tools": ["uuid-google-calendar", "uuid-crm"]
    },
    "support": {
      "model": "gpt-4o",
      "temperature": 0.3,
      "system_prompt": "Eres un agente de soporte técnico. Diagnostica el problema y abre un ticket si no puedes resolverlo.",
      "tools": ["uuid-zendesk", "uuid-human-handoff"]
    },
    "billing": {
      "model": "gpt-4o",
      "temperature": 0.2,
      "system_prompt": "Eres un agente de facturación. Ayuda con consultas de cobros, facturas y reembolsos.",
      "tools": ["uuid-billing-api"]
    },
    "default": {
      "model": "gpt-4o",
      "temperature": 0.7,
      "system_prompt": "Eres un asistente general de la empresa. Responde amablemente y orienta al usuario."
    }
  }
}
```

---

## `supervisor` — Supervisor que orquesta múltiples workers

**Cuándo usarlo:** Cuando la tarea es compleja, requiere múltiples especialistas, y el orden en que deben actuar no es fijo sino que depende del resultado de cada paso.

**Cómo funciona:** Un supervisor LLM analiza el estado de la conversación y decide dinámicamente qué worker llamar a continuación. Cada worker ejecuta su tarea con sus propias tools (loop ReAct completo) y su resultado se agrega al historial compartido. El supervisor puede llamar al mismo worker varias veces, llamar múltiples workers en cualquier orden, y termina cuando emite `{"next": "FINISH"}`.

### Configuración

```json
{
  "type": "agent",
  "graph": {
    "type": "supervisor",
    "supervisor_agent": "supervisor",
    "worker_agents": ["researcher", "writer"],
    "max_iterations": 15
  },
  "agents": {
    "supervisor": {
      "model": "gpt-4o",
      "temperature": 0,
      "system_prompt": "Eres un coordinador de tareas. Diriges a un equipo de especialistas para responder al usuario de la mejor manera posible."
    },
    "researcher": {
      "model": "gpt-4o",
      "temperature": 0.3,
      "system_prompt": "Eres un investigador. Busca y recopila información relevante para la tarea.",
      "tools": ["uuid-web-search", "uuid-knowledge-base"]
    },
    "writer": {
      "model": "gpt-4o",
      "temperature": 0.7,
      "system_prompt": "Eres un redactor experto. Con base en la investigación disponible, escribe una respuesta clara y profesional."
    }
  }
}
```

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `supervisor_agent` | string | Sí | Clave en `agents` del agente coordinador |
| `worker_agents` | string[] | Sí | Lista de claves en `agents` de los workers disponibles |
| `max_iterations` | int | No (def: 15) | Límite total de llamadas a workers para prevenir loops infinitos |

**Protocolo del supervisor:**

El sistema inyecta automáticamente en el system prompt del supervisor la lista de workers disponibles y el protocolo de respuesta. El supervisor debe responder con JSON:

```json
{ "next": "researcher" }   // Llamar al worker researcher
{ "next": "FINISH" }       // La tarea está completa, terminar
```

El `system_prompt` del supervisor debe describir su rol de coordinador. El protocolo técnico (`next`, `FINISH`) lo inyecta el sistema automáticamente — no es necesario incluirlo en el prompt.

### Ejemplo completo

Equipo de análisis de mercado: investigador, analista y redactor coordinados por un supervisor.

```json
{
  "type": "agent",
  "graph": {
    "type": "supervisor",
    "supervisor_agent": "supervisor",
    "worker_agents": ["researcher", "analyst", "writer"],
    "max_iterations": 20
  },
  "agents": {
    "supervisor": {
      "model": "gpt-4o",
      "temperature": 0,
      "system_prompt": "Eres el director de un equipo de análisis de mercado. Coordinas a un researcher (recopila datos), un analyst (interpreta datos) y un writer (redacta el informe final). Asigna tareas en el orden lógico para producir el mejor resultado para el usuario."
    },
    "researcher": {
      "model": "gpt-4o",
      "temperature": 0.2,
      "system_prompt": "Eres un investigador de mercado. Recopila datos, estadísticas y tendencias relevantes sobre el tema solicitado.",
      "tools": ["uuid-web-search", "uuid-statista-api"]
    },
    "analyst": {
      "model": "gpt-4o",
      "temperature": 0.3,
      "system_prompt": "Eres un analista de datos. Interpreta la información recopilada, identifica patrones y genera insights accionables."
    },
    "writer": {
      "model": "gpt-4o",
      "temperature": 0.7,
      "system_prompt": "Eres un redactor de informes ejecutivos. Transforma el análisis en un documento claro, estructurado y profesional."
    }
  }
}
```

---

## Comparativa de los cinco tipos

| | `react` | `pipeline` | `sequential` | `router` | `supervisor` |
|---|---|---|---|---|---|
| **Flujo decidido por** | LLM (dinámico) | Config (estático) | Config (lineal) | LLM classifier + config | LLM supervisor (dinámico) |
| **Número de agentes** | 1 | N (en nodos) | N (en secuencia) | 1 activo por sesión | N (todos disponibles) |
| **Tools** | LLM decide cuándo | Nodos `tool` explícitos | No nativo | Cada agente destino tiene las suyas | Cada worker tiene las suyas |
| **Orden de ejecución** | No determinista | Determinista | Determinista | Determinista tras clasificar | No determinista |
| **Condiciones/bifurcaciones** | No | Sí (nodos `condition`) | No | Solo al inicio (routing) | El supervisor decide |
| **Cuándo usar** | Agente con tools en loop libre | Orquestación compleja con control total | Etapas fijas con roles distintos | Un agente según la intención del usuario | Múltiples especialistas en orden dinámico |
