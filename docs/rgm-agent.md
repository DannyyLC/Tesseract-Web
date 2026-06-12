# Workflow: Router Conversacional con Especialistas y Handoff a Humano

**Audiencia:** quien arma workflows en la plataforma (equipo de agentes / configuradores), sin necesidad de conocer el código interno de Tesseract. Describe cómo **configurar** este workflow usando las capacidades que ofrece el motor Pipeline: la arquitectura del grafo, el mecanismo de ruteo, las tools, las variables y cómo escribir los system prompts.

> Este es **un** workflow de ejemplo entre muchos posibles. El motor Pipeline es genérico; aquí se combinan sus piezas (nodos `agent` agénticos, condición `router`, `set_variables`, `persist_variables`, `disable_tools_if`, `set_variables_on_tool_call`) para construir un router conversacional con traspaso a humano. Otros workflows usarán otras combinaciones. Todas estas capacidades ya están implementadas en el motor.

---

## 1. Descripción General

Este workflow atiende a usuarios que pueden tener necesidades de distintos temas. Un agente **clasificador** mantiene una conversación natural con el usuario hasta tener suficiente contexto para identificar su tema. Una vez identificado, la conversación se transfiere al **especialista** correspondiente, quien responde directamente al usuario.

Los especialistas pueden a su vez detectar que una pregunta pertenece a otro tema y re-rutear la conversación al especialista correcto, todo dentro del mismo ciclo de respuesta: el usuario siempre recibe la respuesta del especialista final, nunca mensajes intermedios de un agente que decidió pasarlo a otro.

Adicionalmente, cada especialista es un **agente agéntico**: tiene acceso a la tool `send_bulk_whatsapp`. Cuando detecta **interés real** del cliente en el producto, el mismo especialista — en el mismo turno y con todo el contexto de la conversación — envía notificaciones de WhatsApp a los responsables humanos correspondientes y le comunica al cliente que un especialista humano lo contactará. Este **handoff ocurre una sola vez por conversación**: el motor lo garantiza de forma determinista, sin depender del prompt.

Existe también un mecanismo anti-loop que detecta cuando el ruteo ha sido excesivo y fuerza al agente general a responder sin posibilidad de escape.

---

## 2. Arquitectura del Grafo

El workflow utiliza el tipo de grafo **Pipeline**. El flujo de ejecución para cada mensaje es:

```
START
  ↓
check_route  ←─────────────────────────────────────────┐
  │                                                      │
  ├─ Sin intent válido          → classifier            │
  ├─ intent="tema_a" (no corrió) → agent_tema_a ────────┤
  ├─ intent="tema_b" (no corrió) → agent_tema_b ────────┤
  ├─ intent="tema_c" (no corrió) → agent_tema_c ────────┤
  ├─ intent="tema_d" (no corrió) → agent_tema_d ────────┤
  ├─ intent="general" (no corrió)→ agent_general ───────┤
  ├─ max re-ruteos alcanzado     → lock_routing ────────┤
  │                                   ↓                  │
  │                              agent_general ──────────┤
  └─ agente ya contestó          → END
```

**Regla fundamental:** cada agente, al terminar, regresa a `check_route`. Este nodo decide si hay que ir a otro agente o terminar. Cuando un agente ya está en el historial de ejecución del ciclo actual y su intent sigue siendo el mismo, se va a `END`.

**El handoff no agrega nodos al grafo.** El envío de notificaciones ocurre *dentro* del nodo del especialista (es una tool call de su loop agéntico), no en un nodo aparte. La topología del grafo es idéntica con o sin handoff.

---

## 3. Tipos de Nodos

### `agent` (modo agéntico)

Llama a un LLM con el historial de mensajes y su system prompt. Puede incluir el mecanismo `[ROUTE:x]` para cambiar el ruteo (ver sección 4). Con `max_iterations > 0` y tools configuradas en `agents_config`, el agente puede **llamar tools** (function calling) dentro de su turno: el LLM razona, llama la tool, recibe el resultado y continúa hasta producir su respuesta final de texto.

Parámetros relevantes en la config del nodo:
```json
{
  "id": "agent_tema_a",
  "type": "agent",
  "agent": "tema_a",
  "output_variable": "intent",
  "classification_pattern": "\\[ROUTE:(\\w+)\\]",
  "max_iterations": 3,
  "disable_tools_if": [
    {
      "tool": "send_bulk_whatsapp",
      "field": "variables.handoff_done",
      "op": "eq",
      "value": true
    }
  ],
  "set_variables_on_tool_call": {
    "send_bulk_whatsapp": { "handoff_done": true }
  }
}
```

- `output_variable`: nombre de la variable donde se guardará el valor extraído del patrón.
- `classification_pattern`: expresión regular. Si el LLM incluye `[ROUTE:ventas]` en su respuesta, se extrae `"ventas"`, se guarda en `variables.intent` y el tag se elimina del mensaje visible al usuario.
- `max_iterations`: número máximo de rondas LLM ↔ tools. Si se omite (o es `0`), el agente hace una sola llamada sin tools (comportamiento clásico). Las tools del agente se configuran en `agents_config[agente].tools`, no en el nodo.
- `disable_tools_if`: reglas evaluadas **al inicio de cada ejecución del nodo** contra el estado. Si una regla matchea, esa tool **no se enlaza al LLM** en esta ejecución — el modelo físicamente no puede llamarla. Es la garantía determinista de que el handoff ocurre una sola vez: una vez que `handoff_done` es `true`, la tool de envío deja de existir para el especialista.
- `set_variables_on_tool_call`: cuando el LLM llama la tool indicada, las variables se setean de forma **determinista** en el estado, en el momento del intento (independiente de si el envío tuvo éxito o no). Así `handoff_done = true` lo setea el motor, nunca el LLM.

> **Por qué "en el intento" y no "en el éxito":** si el envío falla, el especialista puede reintentar *dentro del mismo turno* (las tools ya están enlazadas; el gating solo se evalúa al inicio del nodo). Pero en mensajes posteriores la tool ya estará deshabilitada. Esto implementa exactamente el comportamiento deseado: reintentos en el momento, nunca re-disparos después.

### `condition` — modo `router`

Nodo de decisión puro (sin LLM). Evalúa `variables.intent` contra el mapa de rutas y usa `execution_path` para saber qué agentes ya corrieron en este ciclo.

```json
{
  "id": "check_route",
  "type": "condition",
  "config": {
    "mode": "router",
    "route_variable": "variables.intent",
    "routes": {
      "tema_a": "agent_tema_a",
      "tema_b": "agent_tema_b",
      "tema_c": "agent_tema_c",
      "tema_d": "agent_tema_d",
      "general": "agent_general"
    },
    "fallback": "classifier",
    "max_reroutes": 3,
    "lock_node": "lock_routing"
  }
}
```

- `route_variable`: path de la variable que contiene el intent actual.
- `routes`: mapa de `intent → id del nodo agente`.
- `fallback`: nodo al que ir cuando `variables.intent` está vacío o no es válido.
- `max_reroutes`: número máximo de cambios de intent permitidos antes de activar el lock.
- `lock_node`: nodo `set_variables` que activa el anti-loop.

**Lógica interna:**
1. Si `reroute_count >= max_reroutes` → `lock_node` (y luego al general).
2. Si `variables.intent` no está en `routes` → `fallback`.
3. Si el agente destino ya está en `execution_path` → `END`.
4. Si no → ir al agente destino.

### `set_variables`

Nodo sin LLM que actualiza variables del estado e inyecta instrucciones adicionales al contexto del siguiente agente. Las instrucciones se **suman** al system prompt existente del agente siguiente, no lo reemplazan.

```json
{
  "id": "lock_routing",
  "type": "set_variables",
  "config": {
    "variables": {
      "routing_locked": true
    },
    "append_system_message": "IMPORTANTE — RUTEO BLOQUEADO: Has sido activado porque el sistema detectó re-ruteos excesivos. Debes responder al usuario directamente con la mejor respuesta que puedas dar. No incluyas [ROUTE:x] bajo ninguna circunstancia en esta respuesta."
  }
}
```

- `variables`: objeto con las variables a setear en el estado.
- `append_system_message`: texto que se agrega al final del system prompt del siguiente agente (no lo sobreescribe).

---

## 4. Mecanismo de Señalización `[ROUTE:x]`

### Cómo funciona

Cuando un agente quiere indicar que la conversación debe ser atendida por un especialista específico, incluye el tag `[ROUTE:nombre_del_intent]` en cualquier parte de su respuesta. El sistema lo detecta automáticamente y:

1. Extrae el valor (ej. `"ventas"`).
2. Lo guarda en `variables.intent`.
3. Elimina el tag del mensaje visible al usuario.
4. Incrementa `variables.reroute_count` si el intent cambió respecto al valor anterior.

Si el contenido del mensaje queda vacío tras eliminar el tag, el mensaje no se agrega al historial.

En agentes agénticos, el patrón se evalúa **únicamente sobre la respuesta final de texto** del agente, nunca sobre los mensajes intermedios de tool calling.

### Cuándo incluirlo

| Situación | Acción |
|---|---|
| El clasificador ha entendido el tema | Incluir `[ROUTE:tema]` al final de la respuesta |
| El clasificador aún no tiene suficiente info | No incluir el tag — solo conversar |
| Un especialista detecta pregunta de otro tema | Incluir `[ROUTE:otro_tema]` — idealmente sin respuesta extensa propia |
| Un especialista responde normalmente | No incluir el tag |
| Un especialista hace handoff a humano | **No usar `[ROUTE:x]`** — el handoff es una tool call, no un re-ruteo |

### Regla crítica: si hay `[ROUTE:x]`, el usuario NO ve ese mensaje

Cuando un agente incluye `[ROUTE:x]`, su respuesta **nunca llega al usuario**, independientemente del texto que la acompañe. El mensaje con el tag se usa únicamente como contexto interno para el siguiente agente en la cadena. El usuario solo ve la respuesta del agente final que contesta sin incluir un tag de ruteo.

> **⚠️ Excepción en canales con streaming (efecto "tecleo" en vivo, p.ej. la API web/SSE):** el tag `[ROUTE:x]` **sí puede verse** momentáneamente, porque en streaming el texto se muestra token a token mientras el LLM lo escribe, antes de que el sistema limpie el tag. En canales sin streaming (p.ej. WhatsApp) nunca se ve. **Mitigación recomendada por prompt:** cuando un agente vaya a rutear, debe emitir **solo** `[ROUTE:x]` sin texto adicional (ver templates abajo). Así el mensaje con tag queda vacío y el usuario solo ve la respuesta del agente final. El problema aparece cuando un agente responde *y* rutea en el mismo mensaje.

### Ejemplo completo

El clasificador genera:
```
Entendido, veo que tu pregunta es sobre facturación. [ROUTE:facturacion]
```

Lo que ocurre internamente:
- Tag extraído → `variables.intent = "facturacion"`
- Mensaje del clasificador (sin tag) se mantiene en **el estado del grafo en memoria** para que el agente de facturación tenga contexto — **no se guarda en base de datos**
- `check_route` → agent_facturacion
- Agent facturación genera: `"Con gusto te ayudo con tu factura..."` → **este sí se guarda en DB**

**El usuario recibe únicamente:** `"Con gusto te ayudo con tu factura..."`

Cuando un agente re-rutea sin generar texto propio:
```
[ROUTE:soporte]
```
El mensaje queda vacío → no se agrega al historial → el agente de soporte responde con contexto limpio.

---

## 5. Handoff a Humano

### Concepto

Cuando un especialista determina que el cliente tiene **interés real y concreto** en el producto (no solo curiosidad), debe hacer dos cosas en el mismo turno:

1. **Notificar a los responsables humanos** por WhatsApp llamando a la tool `send_bulk_whatsapp`, usando los templates aprobados de Meta y rellenando sus variables con la información del cliente que ya tiene en el contexto de la conversación (teléfono, producto de interés, detalles mencionados).
2. **Responder al cliente** indicándole que un especialista humano lo contactará pronto.

No hay agente intermedio ni reprocesamiento: el especialista que sostuvo la conversación es quien envía, porque es quien tiene todo el contexto.

### Garantía de "una sola vez" (determinista)

El handoff debe ocurrir **una sola vez por conversación**, sin importar cuántos mensajes más envíe el cliente ("gracias", "ok", nuevas preguntas...). Esto NO depende del prompt — lo garantiza el motor con dos mecanismos:

1. **`set_variables_on_tool_call`**: en el instante en que el especialista llama `send_bulk_whatsapp`, el motor setea `handoff_done = true` en el estado. El LLM no participa en esta decisión.
2. **`disable_tools_if`**: al inicio de cada ejecución del nodo, el motor evalúa `variables.handoff_done`. Si es `true`, la tool `send_bulk_whatsapp` **no se enlaza al LLM** — el especialista físicamente no puede volver a llamarla, diga lo que diga el prompt.

Como `handoff_done` está en `persist_variables`, sobrevive entre mensajes: el bloqueo es permanente para esa conversación.

### Comportamiento después del handoff

Los agentes **siguen respondiendo con normalidad**. El cliente puede seguir preguntando y el especialista contesta como siempre — solo que ya sin la capacidad de re-enviar notificaciones. El prompt instruye al especialista a no repetir el mensaje de "te voy a conectar" en turnos posteriores.

### Destinatarios

Los números de teléfono **no los decide el LLM**: van fijos en el system prompt de cada especialista como parte de sus instrucciones. La regla de negocio es:

- Cada especialista notifica a **sus** responsables (uno o más números, según el área).
- **Siempre**, sin importar el especialista, se notifica además al **responsable global** (Ej. Paco).
- Si el handoff lo dispara el **agente general** (interés que no encaja en ningún especialista), solo se notifica al responsable global.

### Reintentos y fallo del envío

- Si el envío falla, la tool retorna el error al especialista, quien puede **reintentar dentro del mismo turno** (el loop agéntico lo permite hasta `max_iterations`).
- Si tras los reintentos sigue fallando, el especialista — guiado por su prompt — le da al cliente los **datos de contacto directos** de la empresa para que él mismo se comunique. Es el plan B, no el deseado, pero el cliente nunca queda sin salida.
- `handoff_done` queda en `true` aunque el envío haya fallado: el sistema no volverá a intentarlo en mensajes posteriores. El caso de fallo total se resuelve con los datos de contacto directos, no con reintentos infinitos.

---

## 6. Variables del Sistema

Durante una ejecución, el grafo mantiene un conjunto de variables en memoria. **Tú decides cuáles sobreviven entre mensajes** mediante el campo `persist_variables` del `graph_config` (lista de nombres de variables). Las que listas se guardan en la conversación y vuelven a cargarse en el siguiente mensaje; las que no listas viven solo durante esa ejecución y se descartan al terminar.

Para este workflow declaramos:

```json
"persist_variables": ["intent", "handoff_done"]
```

### Variables que persisten

| Variable | Tipo | Descripción |
|---|---|---|
| `intent` | `string` | Intent actual. Determina a qué especialista se dirige el siguiente mensaje. Vacío = no clasificado. |
| `handoff_done` | `bool` | `true` cuando el handoff a humano ya ocurrió en esta conversación. La setea el motor (vía `set_variables_on_tool_call`), nunca el LLM. Deshabilita permanentemente la tool de envío (vía `disable_tools_if`). |

> Si tu workflow necesitara recordar más cosas (p.ej. el plan del cliente o su idioma), basta con agregarlas: `"persist_variables": ["intent", "handoff_done", "customer_tier"]`. No requiere ningún cambio de código en la plataforma.

### Variables de ejecución (se reinician en cada mensaje, porque NO están en `persist_variables`)

| Variable | Tipo | Descripción |
|---|---|---|
| `reroute_count` | `int` | Contador de cambios de intent dentro de la ejecución actual. Inicia en `0` con cada nuevo mensaje del usuario. |
| `routing_locked` | `bool` | Activo solo durante ejecuciones donde se alcanzó `max_reroutes`. Inicia en `false` con cada nuevo mensaje. |

`reroute_count` y `routing_locked` **se reinician entre mensajes** simplemente porque no las incluimos en `persist_variables`. Protegen contra loops dentro de una sola ejecución; lo que ocurrió en el mensaje anterior no afecta estos contadores en el siguiente.

### Comportamiento entre mensajes

- **Mensaje 1**: clasificador conversa, `intent = null`, `handoff_done` no existe → se guarda.
- **Mensaje 2**: clasificador clasifica, `intent = "ventas"` → se guarda. `reroute_count` inicia en `0`.
- **Mensaje 3**: `check_route` lee `intent = "ventas"` → va directo al especialista de ventas. El clasificador no corre.
- **Mensaje N**: el especialista detecta interés real → llama `send_bulk_whatsapp` → el motor setea `handoff_done = true` → se persiste.
- **Mensajes posteriores**: el especialista responde normal, pero la tool de envío ya no está disponible para él. El handoff no puede repetirse.

---

## 7. Sistema Anti-Loop

### Cuándo se activa

Cuando `variables.reroute_count >= max_reroutes` (configurado en el nodo `check_route`), el sistema determina que hay un loop de re-ruteo y activa la secuencia de lock:

```
check_route → lock_routing → agent_general
```

### Qué hace el lock

El nodo `lock_routing` (tipo `set_variables`) hace dos cosas:
1. Pone `variables.routing_locked = true`.
2. Agrega al system prompt del agente general: instrucción explícita de responder sin incluir `[ROUTE:x]`.

Adicionalmente, el sistema **ignora en código** cualquier `[ROUTE:x]` que el agente genere mientras `routing_locked` sea `true`, como segunda línea de defensa.

### Flujo completo del anti-loop

```
reroute_count = 3 (= max_reroutes)
  → check_route: lock no en path → lock_routing
  → lock_routing: routing_locked=true + instrucción al general
  → agent_general: responde (no puede redirigir)
  → check_route: general ya en path → END ✓
```

---

## 8. Guía para System Prompts

### Clasificador

El clasificador es la primera voz que el usuario escucha. No tiene tools — solo conversa y clasifica.

**Template base:**
```
Eres un asistente de atención al cliente de [EMPRESA]. Tu función es entender 
qué necesita el usuario y conectarlo con el área correcta.

Saluda cordialmente y haz las preguntas necesarias para entender su situación. 
Una vez que tengas suficiente contexto, incluye exactamente [ROUTE:intent] al 
final de tu mensaje para indicar a qué área corresponde.

Los intents válidos son:
- [INTENT_1]: [descripción breve]
- [INTENT_2]: [descripción breve]
- [INTENT_3]: [descripción breve]
- [INTENT_4]: [descripción breve]
- general: preguntas generales que no encajan en ninguna categoría

Reglas:
- No menciones que estás clasificando ni que hay distintas áreas.
- No incluyas [ROUTE:x] hasta estar seguro del tema.
- Si no estás seguro, sigue la conversación con naturalidad.
- Cuando incluyas [ROUTE:x], envialo solo.
```

### Especialistas

Cada especialista tiene un área específica, puede re-rutear si detecta que la pregunta no es suya, y es responsable de disparar el handoff a humano cuando detecta interés real.

**Template base:**
```
Eres el especialista de [ÁREA] de [EMPRESA]. Tienes acceso a:
[lista de información o tools disponibles]

Tu función es responder preguntas sobre [ÁREA] con precisión y amabilidad.

== RE-RUTEO ==
Si el usuario hace una pregunta que claramente corresponde a otra área, emite 
únicamente [ROUTE:intent_correcto] sin texto adicional para que el agente 
destino responda directamente al usuario.

Los intents válidos del sistema son:
- [INTENT_1]: [descripción breve]
- [INTENT_2]: [descripción breve]
- [INTENT_3]: [descripción breve]
- [INTENT_4]: [descripción breve]
- general: preguntas generales o cuando ningún especialista aplica

Reglas de re-ruteo:
- No re-rutees si puedes responder la pregunta aunque sea parcialmente.
- No re-rutees a tu propio intent.

== HANDOFF A HUMANO ==
Cuando el cliente muestre interés REAL y CONCRETO en adquirir [PRODUCTO/SERVICIO]
(quiere comprar, pide cotización, pregunta cómo proceder — no solo curiosidad
general), haz lo siguiente EN ESTE ORDEN dentro del mismo turno:

1. Llama a la tool send_bulk_whatsapp para notificar a los responsables:
   - Destinatario de tu área: +52[NÚMERO_ÁREA] con template [TEMPLATE_ID_ÁREA]
   - Destinatario global (siempre): +52[NÚMERO_Z] con template [TEMPLATE_ID_Z]
   - Incluye TODOS los destinatarios en UNA SOLA llamada a la tool.
   - Variables del template:
     * Variable 1: número de teléfono del cliente (está en el contexto de la conversación)
     * Variable 2: producto o tema de interés que mencionó el cliente
     * Variable 3: detalles relevantes que el cliente haya especificado

2. Después del envío exitoso, responde al cliente:
   "Con gusto te ayudaré personalmente. Un especialista de [EMPRESA] se pondrá 
   en contacto contigo a la brevedad para continuar con el proceso."

Reglas del handoff:
- Solo dispara el handoff ante interés genuino y específico, no ante preguntas generales.
- Si la tool retorna un error, reintenta la llamada. Si tras los reintentos sigue
  fallando, dale al cliente los datos de contacto directos: [TELÉFONO_EMPRESA],
  [EMAIL_EMPRESA], y discúlpate brevemente por el inconveniente.
- Si la tool de envío no está disponible, significa que el handoff ya ocurrió en esta
  conversación: responde con normalidad y NO vuelvas a decir "te voy a conectar".
- Nunca menciones al cliente que estás enviando notificaciones internas.
```
---

## 9. Configuración JSON Completa

Esta es la estructura base del workflow. Reemplaza los valores entre corchetes con los específicos del cliente.

```json
{
  "type": "pipeline",
  "persist_variables": ["intent", "handoff_done"],
  "nodes": [
    {
      "id": "check_route",
      "type": "condition",
      "config": {
        "mode": "router",
        "route_variable": "variables.intent",
        "routes": {
          "tema_a":   "agent_tema_a",
          "tema_b":   "agent_tema_b",
          "tema_c":   "agent_tema_c",
          "tema_d":   "agent_tema_d",
          "general":  "agent_general"
        },
        "fallback": "classifier",
        "max_reroutes": 3,
        "lock_node": "lock_routing"
      }
    },
    {
      "id": "lock_routing",
      "type": "set_variables",
      "config": {
        "variables": {
          "routing_locked": true
        },
        "append_system_message": "IMPORTANTE — RUTEO BLOQUEADO: Debes responder al usuario directamente con la mejor respuesta posible. No incluyas [ROUTE:x] en esta respuesta bajo ninguna circunstancia."
      }
    },
    {
      "id": "agent_general",
      "type": "agent",
      "agent": "general",
      "output_variable": "intent",
      "classification_pattern": "\\[ROUTE:(\\w+)\\]",
      "max_iterations": 3,
      "disable_tools_if": [
        { "tool": "send_bulk_whatsapp", "field": "variables.handoff_done", "op": "eq", "value": true }
      ],
      "set_variables_on_tool_call": {
        "send_bulk_whatsapp": { "handoff_done": true }
      }
    },
    {
      "id": "agent_tema_a",
      "type": "agent",
      "agent": "tema_a",
      "output_variable": "intent",
      "classification_pattern": "\\[ROUTE:(\\w+)\\]",
      "max_iterations": 3,
      "disable_tools_if": [
        { "tool": "send_bulk_whatsapp", "field": "variables.handoff_done", "op": "eq", "value": true }
      ],
      "set_variables_on_tool_call": {
        "send_bulk_whatsapp": { "handoff_done": true }
      }
    },
    {
      "id": "agent_tema_b",
      "type": "agent",
      "agent": "tema_b",
      "output_variable": "intent",
      "classification_pattern": "\\[ROUTE:(\\w+)\\]",
      "max_iterations": 3,
      "disable_tools_if": [
        { "tool": "send_bulk_whatsapp", "field": "variables.handoff_done", "op": "eq", "value": true }
      ],
      "set_variables_on_tool_call": {
        "send_bulk_whatsapp": { "handoff_done": true }
      }
    },
    {
      "id": "agent_tema_c",
      "type": "agent",
      "agent": "tema_c",
      "output_variable": "intent",
      "classification_pattern": "\\[ROUTE:(\\w+)\\]",
      "max_iterations": 3,
      "disable_tools_if": [
        { "tool": "send_bulk_whatsapp", "field": "variables.handoff_done", "op": "eq", "value": true }
      ],
      "set_variables_on_tool_call": {
        "send_bulk_whatsapp": { "handoff_done": true }
      }
    },
    {
      "id": "agent_tema_d",
      "type": "agent",
      "agent": "tema_d",
      "output_variable": "intent",
      "classification_pattern": "\\[ROUTE:(\\w+)\\]",
      "max_iterations": 3,
      "disable_tools_if": [
        { "tool": "send_bulk_whatsapp", "field": "variables.handoff_done", "op": "eq", "value": true }
      ],
      "set_variables_on_tool_call": {
        "send_bulk_whatsapp": { "handoff_done": true }
      }
    }
  ],
  "edges": [
    { "from": "START",        "to": "check_route"  },
    { "from": "lock_routing", "to": "agent_general"},
    { "from": "agent_general","to": "check_route"  },
    { "from": "agent_tema_a", "to": "check_route"  },
    { "from": "agent_tema_b", "to": "check_route"  },
    { "from": "agent_tema_c", "to": "check_route"  },
    { "from": "agent_tema_d", "to": "check_route"  }
  ]
}
```

La sección `agents_config` (separada del `graph_config`) define el modelo, temperatura, system prompt y **tools** de cada agente. Los especialistas y el general llevan `send_bulk_whatsapp` en su lista de tools (vía el UUID del TenantTool correspondiente); el clasificador no lleva tools:

```json
{
  "general":    { "model": "[MODELO]", "temperature": 0.5, "system_prompt": "...", "tools": ["<uuid_send_bulk_whatsapp>"] }
  "tema_a":     { "model": "[MODELO]", "temperature": 0.5, "system_prompt": "...", "tools": ["<uuid_send_bulk_whatsapp>"] },
  "tema_b":     { "model": "[MODELO]", "temperature": 0.5, "system_prompt": "...", "tools": ["<uuid_send_bulk_whatsapp>"] },
  "tema_c":     { "model": "[MODELO]", "temperature": 0.5, "system_prompt": "...", "tools": ["<uuid_send_bulk_whatsapp>"] },
  "tema_d":     { "model": "[MODELO]", "temperature": 0.5, "system_prompt": "...", "tools": ["<uuid_send_bulk_whatsapp>"] }
}
```

El campo `persist_variables` a nivel raíz del `graph_config` declara qué variables se guardan en la conversación entre mensajes. Aquí `intent` y `handoff_done`; lo demás (`reroute_count`, `routing_locked`) vive solo durante cada ejecución. **Si lo omites, no se persiste nada** y cada mensaje arranca sin memoria.

---

## 10. Flujos Esperados

### Clasificación normal (2 mensajes)

```
Usuario:    "hola, tengo una duda"
Sistema:    check_route → intent vacío → classifier
Classifier: "¡Hola! ¿En qué te puedo ayudar hoy?"
            (sin [ROUTE:x])

Usuario:    "quiero saber sobre los precios del plan premium"
Sistema:    check_route → intent vacío → classifier
Classifier: "Con gusto te ayudo. [ROUTE:tema_a]"
            (tag detectado → mensaje queda solo en contexto interno, no llega al usuario)
Sistema:    check_route → intent="tema_a", no en path → agent_tema_a
Agent_A:    "El plan premium tiene las siguientes características..."
Sistema:    check_route → intent="tema_a", tema_a YA en path → END

Usuario ve: solo "El plan premium tiene las siguientes características..."
```

### Re-ruteo entre especialistas

```
Usuario:    "ya estoy en el plan premium, ¿cómo configuro mi cuenta?"
[intent guardado = "tema_a" desde conversación anterior]
Sistema:    check_route → intent="tema_a", no en path → agent_tema_a
Agent_A:    "[ROUTE:tema_b]"
            (solo el tag, sin texto — reroute_count = 1)
Sistema:    check_route → intent="tema_b", no en path → agent_tema_b
Agent_B:    "Para configurar tu cuenta, sigue estos pasos..."
Sistema:    check_route → tema_b YA en path → END

Usuario ve: solo "Para configurar tu cuenta, sigue estos pasos..."
```

### Handoff a humano (interés real detectado)

```
Usuario:    "me interesa, ¿cómo puedo contratarlo?"
[intent guardado = "tema_a", handoff_done no existe]
Sistema:    check_route → intent="tema_a", no en path → agent_tema_a
Agent_A:    (razona: interés real → llama send_bulk_whatsapp con
             destinatarios de su área + responsable global, variables del
             template extraídas de la conversación)
Motor:      handoff_done = true  (set_variables_on_tool_call, determinista)
Tool:       envío exitoso → resultado regresa al agente
Agent_A:    "Con gusto te ayudaré personalmente. Un especialista se pondrá
             en contacto contigo a la brevedad."
Sistema:    check_route → tema_a YA en path → END

Usuario ve:        el mensaje de transición del especialista
Humanos reciben:   WhatsApp con teléfono del cliente, producto de interés y detalles
DB:                handoff_done = true persiste en la conversación
```

### Mensaje posterior al handoff (NO se re-envía)

```
Usuario:    "muchas gracias!"
[intent = "tema_a", handoff_done = true]
Sistema:    check_route → intent="tema_a", no en path → agent_tema_a
Motor:      disable_tools_if matchea → send_bulk_whatsapp NO se enlaza al LLM
Agent_A:    "¡Con gusto! Estamos para servirte."
            (no puede re-enviar aunque quisiera; tampoco repite "te voy a conectar")
Sistema:    check_route → tema_a YA en path → END

Humanos:    NO reciben nada nuevo ✓
```

### Handoff con fallo de envío

```
Usuario:    "sí, quiero contratar"
Agent_A:    llama send_bulk_whatsapp → ERROR del servicio
Motor:      handoff_done = true (se setea en el intento, no en el éxito)
Agent_A:    reintenta dentro del mismo turno (loop agéntico) → ERROR de nuevo
Agent_A:    (tras agotar reintentos, sigue su prompt de fallback)
            "Estamos teniendo un inconveniente técnico. Puedes contactarnos
             directamente al [TELÉFONO] o por [EMAIL]. Una disculpa."
Sistema:    check_route → tema_a YA en path → END

Mensajes posteriores: la tool ya está deshabilitada → no se reintenta nunca más.
El cliente tiene los datos de contacto directos.
```

### Activación del anti-loop

```
[reroute_count = 3, max_reroutes = 3]
Sistema:    check_route → reroute_count >= max → lock_routing
lock:       routing_locked=true + instrucción agregada al general
Sistema:    → agent_general (con instrucción adicional en contexto)
Agent_G:    "Entiendo tu consulta. [respuesta directa sin [ROUTE:x]]"
Sistema:    check_route → general YA en path → END
```

---

## 11. Checklist de Implementación

**Router base:**
- [ ] Definir los 4 intents específicos del cliente y sus nombres en snake_case
- [ ] Declarar `"persist_variables": ["intent", "handoff_done"]` en el `graph_config`
- [ ] Reemplazar `tema_a/b/c/d` en el JSON por los nombres reales de los intents
- [ ] Escribir el system prompt del clasificador con los intents y descripciones reales
- [ ] Definir `max_reroutes` según la complejidad esperada (recomendado: 3)
- [ ] Configurar el modelo y temperatura para cada agente en `agents_config`
- [ ] Revisar que el `append_system_message` del lock sea coherente con el idioma del cliente

**Handoff a humano:**
- [ ] Crear el TenantTool de `send_bulk_whatsapp` y obtener su UUID
- [ ] Agregar el UUID a la lista `tools` de cada especialista y del agente general en `agents_config`
- [ ] Configurar en cada nodo especialista: `max_iterations`, `disable_tools_if` y `set_variables_on_tool_call` (ver sección 9)
- [ ] Crear/verificar los templates de WhatsApp aprobados por Meta para las notificaciones internas
- [ ] Definir los números de los responsables por área y el del responsable global (persona Z)
- [ ] Escribir el system prompt de cada especialista con: su dominio, sus destinatarios de handoff, los template IDs, las variables del template y el fallback con datos de contacto directos
- [ ] Escribir el system prompt del agente general (handoff solo a responsable global)

**Pruebas:**
- [ ] Probar el flujo de clasificación de 2 turnos
- [ ] Probar el re-ruteo entre especialistas
- [ ] Probar que el anti-loop funciona y el mensaje es útil para el usuario
- [ ] Probar el handoff: los humanos correctos reciben el WhatsApp con los datos correctos del cliente
- [ ] Probar que `handoff_done = true` queda en `Conversation.metadata.variables` en DB
- [ ] Probar que mensajes posteriores del cliente NO re-disparan notificaciones
- [ ] Probar el fallo de envío (mock del servicio): el especialista da los datos de contacto directos y no reintenta en mensajes posteriores
- [ ] Probar el handoff desde el agente general: solo notifica al responsable global
