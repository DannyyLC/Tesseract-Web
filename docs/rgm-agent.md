# Workflow: Router Conversacional con Especialistas

Documento de implementación para el equipo de agentes. Describe la arquitectura, el mecanismo de ruteo, las variables del sistema y cómo escribir los system prompts.

---

## 1. Descripción General

Este workflow atiende a usuarios que pueden tener necesidades de distintos temas. Un agente **clasificador** mantiene una conversación natural con el usuario hasta tener suficiente contexto para identificar su tema. Una vez identificado, la conversación se transfiere al **especialista** correspondiente, quien responde directamente al usuario.

Los especialistas pueden a su vez detectar que una pregunta pertenece a otro tema y re-rutear la conversación al especialista correcto, todo dentro del mismo ciclo de respuesta: el usuario siempre recibe la respuesta del especialista final, nunca mensajes intermedios de un agente que decidió pasarlo a otro.

Existe un mecanismo anti-loop que detecta cuando el ruteo ha sido excesivo y fuerza al agente general a responder sin posibilidad de escape.

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

---

## 3. Tipos de Nodos

### `agent`
Llama a un LLM con el historial de mensajes y su system prompt. Puede incluir el mecanismo `[ROUTE:x]` para cambiar el ruteo (ver sección 4).

Parámetros relevantes en la config:
```json
{
  "id": "classifier",
  "type": "agent",
  "agent": "classifier",
  "output_variable": "intent",
  "classification_pattern": "\\[ROUTE:(\\w+)\\]"
}
```

- `output_variable`: nombre de la variable donde se guardará el valor extraído del patrón.
- `classification_pattern`: expresión regular. Si el LLM incluye `[ROUTE:ventas]` en su respuesta, se extrae `"ventas"`, se guarda en `variables.intent` y el tag se elimina del mensaje visible al usuario.

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
      "clasificador": "agent_general"
    },
    "fallback": "clasificador",
    "max_reroutes": 3
  }
}
```

- `route_variable`: path de la variable que contiene el intent actual.
- `routes`: mapa de `intent → id del nodo agente`.
- `fallback`: nodo al que ir cuando `variables.intent` está vacío o no es válido.
- `max_reroutes`: número máximo de cambios de intent permitidos antes de activar el lock.

**Lógica interna:**
1. Si `reroute_count >= max_reroutes` → `lock_routing` (y luego al general).
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

### Cuándo incluirlo

| Situación | Acción |
|---|---|
| El clasificador ha entendido el tema | Incluir `[ROUTE:tema]` al final de la respuesta |
| El clasificador aún no tiene suficiente info | No incluir el tag — solo conversar |
| Un especialista detecta pregunta de otro tema | Incluir `[ROUTE:otro_tema]` — idealmente sin respuesta extensa propia |
| Un especialista responde normalmente | No incluir el tag |

### Regla crítica: si hay `[ROUTE:x]`, el usuario NO ve ese mensaje

Cuando un agente incluye `[ROUTE:x]`, su respuesta **nunca llega al usuario**, independientemente del texto que la acompañe. El mensaje con el tag se usa únicamente como contexto interno para el siguiente agente en la cadena. El usuario solo ve la respuesta del agente final que contesta sin incluir un tag de ruteo.

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

El texto del clasificador nunca se persiste ni se muestra. Existe solo durante la ejecución del grafo para dar contexto al agente siguiente y desaparece al terminar el ciclo.

Cuando un agente re-rutea sin generar texto propio:
```
[ROUTE:soporte]
```
El mensaje queda vacío → no se agrega al historial → el agente de soporte responde con contexto limpio.

---

## 5. Variables del Sistema

Las variables del sistema se dividen en dos categorías según su ciclo de vida:

### Variables persistentes (sobreviven entre mensajes)

| Variable | Tipo | Descripción |
|---|---|---|
| `intent` | `string` | Intent actual. Determina a qué especialista se dirige el siguiente mensaje. Vacío = no clasificado. |

Solo `intent` se preserva entre mensajes. Es la única información que el sistema necesita recordar de una conversación a la siguiente.

### Variables de ejecución (se reinician en cada mensaje)

| Variable | Tipo | Descripción |
|---|---|---|
| `reroute_count` | `int` | Contador de cambios de intent dentro de la ejecución actual. Siempre inicia en `0` con cada nuevo mensaje del usuario. |
| `routing_locked` | `bool` | Activo solo durante ejecuciones donde se alcanzó `max_reroutes`. Siempre inicia en `false` con cada nuevo mensaje. |

`reroute_count` y `routing_locked` **nunca se transfieren entre mensajes**. Protegen únicamente contra loops dentro de una sola ejecución (un mensaje del usuario). Lo que ocurrió en el mensaje anterior no afecta estos contadores en el siguiente.

### Comportamiento entre mensajes

- **Mensaje 1**: clasificador conversa, `intent = null` → se guarda.
- **Mensaje 2**: clasificador clasifica, `intent = "ventas"` → se guarda. `reroute_count` inicia en `0`.
- **Mensaje 3**: `check_route` lee `intent = "ventas"` → va directo al especialista de ventas. El clasificador no corre. `reroute_count` inicia en `0` de nuevo.
- **Todos los mensajes siguientes**: mismo comportamiento hasta que el intent cambie.

---

## 6. Sistema Anti-Loop

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

## 7. Guía para System Prompts

### Clasificador

El clasificador es la primera voz que el usuario escucha. Debe:
- Presentarse y entender la necesidad del usuario con preguntas naturales.
- Conversar sin revelar que es un sistema de clasificación.
- Incluir `[ROUTE:intent]` únicamente cuando esté seguro del tema.
- Poder responder preguntas generales si el tema no encaja en ningún especialista (`[ROUTE:general]`).

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
- Cuando incluyas [ROUTE:x], puedes acompañarlo de una frase de transición 
  como "Con gusto te conecto con el equipo indicado."
```

### Especialistas

Cada especialista tiene un área específica y puede re-rutear si detecta que la pregunta no es suya. Deben conocer todos los intents válidos del sistema para poder redirigir correctamente.

**Template base:**
```
Eres el especialista de [ÁREA] de [EMPRESA]. Tienes acceso a:
[lista de información o tools disponibles]

Tu función es responder preguntas sobre [ÁREA] con precisión y amabilidad.

Si el usuario hace una pregunta que claramente corresponde a otra área, incluye 
[ROUTE:intent_correcto] en tu respuesta para pasarlo al especialista adecuado. 
En ese caso, no generes una respuesta extensa — solo emite el tag sin texto adicional.

Los intents válidos del sistema son:
- [INTENT_1]: [descripción breve]
- [INTENT_2]: [descripción breve]
- [INTENT_3]: [descripción breve]
- [INTENT_4]: [descripción breve]
- general: preguntas generales o cuando ningún especialista aplica

Reglas:
- Responde directamente y con precisión sobre tu área.
- Si necesitas re-rutear, emite únicamente [ROUTE:intent] sin texto adicional para 
  que el agente destino responda directamente al usuario.
- No re-rutees si puedes responder la pregunta aunque sea parcialmente.
- No re-rutees a tu propio intent.
```

---

## 8. Configuración JSON Completa

Esta es la estructura base del workflow. Reemplaza los valores entre corchetes con los específicos del cliente.

```json
{
  "type": "pipeline",
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
        "max_reroutes": 3
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
      "id": "classifier",
      "type": "agent",
      "agent": "classifier",
      "output_variable": "intent",
      "classification_pattern": "\\[ROUTE:(\\w+)\\]"
    },
    {
      "id": "agent_tema_a",
      "type": "agent",
      "agent": "tema_a",
      "output_variable": "intent",
      "classification_pattern": "\\[ROUTE:(\\w+)\\]"
    },
    {
      "id": "agent_tema_b",
      "type": "agent",
      "agent": "tema_b",
      "output_variable": "intent",
      "classification_pattern": "\\[ROUTE:(\\w+)\\]"
    },
    {
      "id": "agent_tema_c",
      "type": "agent",
      "agent": "tema_c",
      "output_variable": "intent",
      "classification_pattern": "\\[ROUTE:(\\w+)\\]"
    },
    {
      "id": "agent_tema_d",
      "type": "agent",
      "agent": "tema_d",
      "output_variable": "intent",
      "classification_pattern": "\\[ROUTE:(\\w+)\\]"
    },
    {
      "id": "agent_general",
      "type": "agent",
      "agent": "general",
      "output_variable": "intent",
      "classification_pattern": "\\[ROUTE:(\\w+)\\]"
    }
  ],
  "edges": [
    { "from": "START",        "to": "check_route"  },
    { "from": "lock_routing", "to": "agent_general" },
    { "from": "classifier",   "to": "check_route"  },
    { "from": "agent_tema_a", "to": "check_route"  },
    { "from": "agent_tema_b", "to": "check_route"  },
    { "from": "agent_tema_c", "to": "check_route"  },
    { "from": "agent_tema_d", "to": "check_route"  },
    { "from": "agent_general","to": "check_route"  }
  ]
}
```

La sección `agents_config` (separada del `graph_config`) define el modelo, temperatura y system prompt de cada agente nombrado arriba (`classifier`, `tema_a`, `tema_b`, etc.).

---

## 9. Flujos Esperados

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
           (el "Con gusto te ayudo." del clasificador no llega al usuario)
```

### Pregunta directa al especialista (ruteo silencioso)

El clasificador reconoce el tema de inmediato y enruta sin generar texto propio.

```
Usuario:    "¿cuál es el horario de soporte técnico?"
Sistema:    check_route → intent vacío → classifier
Classifier: "[ROUTE:tema_b]"
            (mensaje vacío → no se agrega al historial)
Sistema:    check_route → intent="tema_b", no en path → agent_tema_b
Agent_B:    "El horario de soporte técnico es de 9am a 6pm..."
Sistema:    check_route → tema_b YA en path → END

Usuario ve: "El horario de soporte técnico es de 9am a 6pm..."
```

### Pregunta general (clasificador responde directamente)

Si la pregunta no corresponde a ningún especialista, el clasificador la responde
sin emitir `[ROUTE:x]`. Su respuesta llega directamente al usuario.

```
Usuario:    "¿cuáles son los medios de contacto de la empresa?"
Sistema:    check_route → intent vacío → classifier
Classifier: "Puedes contactarnos por email, teléfono o chat en vivo."
            (sin [ROUTE:x] → intent no cambia → sigue vacío)
Sistema:    check_route → intent vacío → fallback (classifier), pero
            classifier YA en path → END

Usuario ve: "Puedes contactarnos por email, teléfono o chat en vivo."
```

### Re-ruteo entre especialistas

El especialista destino responde. El mensaje del agente que enrutó no llega al usuario.

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
           (agent_A no generó texto, agent_B es la respuesta final)
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

## 10. Checklist de Implementación

- [ ] Definir los 4 intents específicos del cliente y sus nombres en snake_case
- [ ] Reemplazar `tema_a/b/c/d` en el JSON por los nombres reales de los intents
- [ ] Escribir el system prompt del clasificador con los intents y descripciones reales
- [ ] Escribir el system prompt de cada especialista con su información de dominio
- [ ] Escribir el system prompt del agente general
- [ ] Definir `max_reroutes` según la complejidad esperada (recomendado: 3)
- [ ] Configurar el modelo y temperatura para cada agente en `agents_config`
- [ ] Revisar que el `append_system_message` del lock sea coherente con el idioma del cliente
- [ ] Probar el flujo de clasificación de 2 turnos
- [ ] Probar el re-ruteo entre especialistas
- [ ] Probar que el anti-loop funciona y el mensaje es útil para el usuario
