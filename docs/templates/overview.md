---
title: 'Templates de Agente'
description: 'Cuatro funciones, dos voces: el sistema para entregar un agente base el mismo día que lo pide el cliente.'
---

Un template es una **configuración semilla** de `Workflow.config`: un `system_prompt` con huecos, un
juego de tools y unos valores de modelo. No es una entidad nueva en la base de datos ni un tipo de
grafo distinto — los cuatro corren sobre `pipeline` ([Tipos de Agente](/reference/agent-types)).

El objetivo es de velocidad: que un cliente pida un agente por la mañana y por la tarde tenga un
número o una página donde probarlo. El template no configura su caso; le da el agente base.

---

## Dos ejes, no uno

La primera versión de este catálogo tenía tres templates y dos de ellos hacían el mismo trabajo con
distinta voz. Ese es el error que este sistema evita: **la voz no es un template, es un bloque
intercambiable.**

- **Función** → el template. Qué hace el agente. Son cuatro.
- **Voz** → un preset del bloque 4. Cómo suena. Son dos.

Cuatro funciones × dos voces son ocho agentes distintos, manteniendo cuatro prompts y dos medias
páginas. Con un template por combinación serían ocho prompts que divergen entre sí en cuanto alguien
mejora uno.

---

## Las cuatro funciones

| Template | Qué hace | Lo pide | Tool que lo define |
| --- | --- | --- | --- |
| [Ventas](/templates/ventas) | Informa y califica a quien todavía no es cliente | Inmobiliarias, B2B, servicios | `human_handoff` |
| [Soporte](/templates/soporte) | Resuelve el caso de quien ya compró | E-commerce, retail, SaaS | `http_request` |
| [Agendamiento](/templates/agendamiento) | Toma, mueve y cancela citas | Médicos, abogados, contadores, gimnasios | `google_calendar` |
| [Catálogo y pedidos](/templates/catalogo) | Responde qué hay y a qué precio, y arma el pedido | Restaurantes, retail, e-commerce | `dataset` |

### Cuál elegir

```
¿Quién escribe?
│
├─ Alguien que todavía no es cliente
│  ├─ Quiere saber si le sirve ......... Ventas
│  ├─ Quiere ver qué tienes y pedir .... Catálogo y pedidos
│  └─ Quiere una cita .................. Agendamiento
│
└─ Alguien que ya compró
   └─ Tiene un problema ................ Soporte
```

**Soporte y Catálogo se parecen** —ambos leen datos del cliente y responden con ellos— pero el
objetivo los separa, y con él todo lo demás. Catálogo persigue que la conversación termine en un
pedido; Soporte, que termine en un caso cerrado. Uno abre con lo que hay disponible, el otro pide un
identificador antes de decir nada. Puestos al revés, el de Catálogo le pregunta el número de pedido
a quien solo quería saber el precio.

**No hay un quinto genérico.** Lo que no encaje se resuelve con Ventas y el alcance reescrito. Un
template "para todo" es el que nadie sabe cuándo elegir.

<Note>
  Se descartó un template de **seguimiento saliente** (recordatorios, cobranza, carritos
  abandonados). Dos razones: el cliente no puede probarlo —recibe un mensaje sin contexto y la demo
  se siente rara en vez de convincente— y depende de `WorkflowCronTrigger`, que todavía no está
  suficientemente sólido. Queda como candidato cuando eso cambie.
</Note>

---

## Las dos voces

Ambas ocupan el **bloque 4** de cualquier template. Se elige una, se pega, y se borra la otra.

<Note>
  **Soporte no usa estos presets.** Trae su propio bloque 4, neutro y sin emojis: quien escribe a
  soporte suele venir molesto y las dos voces de abajo empeoran esa conversación, cada una a su
  manera.
</Note>

### Voz A — Formal

```text
=== 4. REGISTRO Y FORMATO ===
- Trato de usted. Español neutro de México, sin regionalismos ni coloquialismos.
- Cero emojis. Ninguno, en ningún mensaje, tampoco si el cliente los usa.
- Una sola exclamación por mensaje como máximo, y solo si aporta.
- Frases completas. No abrevias ("xq", "porfa", "tmb").
- Párrafos de dos o tres oraciones. Nunca más de un párrafo por respuesta salvo
  que enumeres opciones.
- Si el cliente escribe en otro idioma, respondes en ese idioma manteniendo el
  mismo registro.
```

Con esta voz, los templates que tienen `{{mensaje_apertura}}` y `{{mensaje_cierre}}` los usan casi
literales. Es lo que produce la sensación de guion institucional. Y baja `temperature` a **0.3**: por
encima de 0.5 el registro se mueve entre conversaciones y la apertura fija deja de sonar fija.

### Voz B — Cercana

```text
=== 4. REGISTRO Y FORMATO ===
- Tuteo. Español mexicano natural. Puedes usar "qué tal", "claro que sí", "con
  gusto", "va", "sale". Sin caricaturizar: no todo mensaje lleva modismo.
- Emojis: como mucho uno por mensaje, y NO en todos los mensajes. Como acento,
  nunca como puntuación. Cero emojis cuando el cliente esté molesto, cuando des
  una mala noticia o cuando hables de dinero.
- Cero emojis decorativos al inicio de línea o como viñetas.
- Cálido, no eufórico. Nada de "¡¡Excelente pregunta!!" ni cadenas de
  exclamaciones. Un signo por mensaje basta.
- No abras cada respuesta felicitando al cliente por preguntar.
- Frases cortas. Contracciones y lenguaje hablado están bien; las abreviaturas
  tipo "xq" o "porfa", no.
- Si el cliente escribe en otro idioma, respondes en ese idioma con el mismo tono.
```

Con esta voz se **borran** `{{mensaje_apertura}}` y `{{mensaje_cierre}}`: el agente los arma cada vez.
`temperature` a **0.7**, porque con 0.3 acaba repitiendo la misma frase de saludo, que es justo lo
que esta voz quiere evitar.

### Dónde se rompe cada una

**Formal:** el "cero emojis" se erosiona si el cliente los usa. La regla está redactada como absoluta
y con esa excepción cerrada de forma explícita; si la acortas al editarla, vuelve el problema.

**Cercana:** "cercano" no es "abierto". El bloque 2 sigue siendo igual de estricto — lo único que
cambia es cómo se dice el no. Si al ajustar el tono también suavizas el alcance, el agente termina
explicando temas que no le tocan. Y el entusiasmo empuja a complacer, que es exactamente lo que
produce un precio inventado.

---

## Todos son `pipeline`, ninguno es `react`

Es una decisión deliberada y va a contramano de lo que sugiere la tabla comparativa de
[Tipos de Agente](/reference/agent-types), que reserva `react` para el "agente con tools en loop
libre". La razón es que **`pipeline` ya hace eso**, y la dirección del producto es tener un solo tipo
de grafo en vez de cinco que se solapan.

El nodo `agent` de un pipeline tiene dos modos ([agent.py:50](apps/agents/src/graphs/pipeline/nodes/agent.py#L50)):

- `max_iterations: 0` (default) — una sola llamada al LLM, sin tools.
- `max_iterations > 0` — **modo agéntico**: el mismo loop LLM ↔ tools que hace `react`, cargando las
  tools por el mismo `registry.load_tools()` y parando cuando el modelo responde texto o se agota el
  límite.

O sea que un pipeline de un solo nodo agéntico **es** un agente ReAct, con la misma config de
`agents` y las mismas tools. El grafo mínimo equivalente:

```json
{
  "type": "agent",
  "graph": {
    "type": "pipeline",
    "schema_version": 1,
    "nodes": [
      { "id": "agente", "type": "agent", "agent": "default", "max_iterations": 8 }
    ],
    "edges": [
      { "from": "START", "to": "agente" },
      { "from": "agente", "to": "END" }
    ]
  },
  "agents": {
    "default": { "model": "gpt-4o", "temperature": 0.7, "system_prompt": "...", "tools": ["uuid-..."] }
  }
}
```

Dos diferencias de forma con `react`: `max_iterations` va **en el nodo**, no en `graph.config`, y hay
que declarar las `edges` con `START` y `END`. Las tools siguen en `agents.<nombre>.tools`.

### Qué se gana

Arrancar en pipeline no cuesta nada y abre la puerta de salida. Cuando un agente concreto empiece a
fallar, el arreglo no es migrar de tipo de grafo: es agregar un nodo.

| Capacidad | `react` | `pipeline` |
| --- | --- | --- |
| Loop LLM ↔ tools | Sí | Sí, con `max_iterations > 0` |
| Forzar una tool antes de responder | No | Sí, con un nodo `tool` previo |
| Deshabilitar tools según el estado | No | Sí, `disable_tools_if` — gating sin prompt |
| Bifurcar por intención | No | Sí, nodos `condition` |
| Templates `{{variables.x}}` en el system prompt | No | Sí |
| Setear variables al llamar una tool | No | Sí, `set_variables_on_tool_call` |
| Pausar antes de ejecutar tools (HITL) | Sí, `interrupts` | **No** |

Eso importa porque las "trampas conocidas" de tres de los cuatro templates son el mismo problema:
con un loop libre, **nada obliga** al modelo a consultar antes de afirmar. La regla dura lo pide y el
modelo la cumple casi siempre — casi. En pipeline, el día que un cliente reporte un horario
inventado, la disponibilidad pasa a ser un nodo `tool` que corre antes del nodo `agent` y el modelo
ya no puede saltárselo. El prompt no cambia.

<Note>
  **La única capacidad que `react` tiene y `pipeline` no** es `interrupts: ["before_tools"]`, la
  pausa para human-in-the-loop antes de ejecutar una tool. Ninguno de los cuatro templates la usa, así
  que no bloquea nada — pero si algún día hace falta aprobar una acción antes de ejecutarla, hoy eso
  solo existe en `react`.
</Note>

Además, el JSON de pipeline es el contrato del futuro editor visual: el mismo que ejecuta el motor es
el que va a leer y escribir el editor ([Schema del grafo Pipeline](/reference/pipeline-graph-schema)).
Un agente nacido en pipeline ya es editable ahí; uno nacido en `react`, no.

---

## El esqueleto común

Los cuatro prompts tienen los mismos ocho bloques, en el mismo orden. El orden importa: lo que va
primero pesa más cuando el modelo resuelve una contradicción, y las reglas duras van después del
contexto para que ganen sobre él.

| # | Bloque | Qué fija |
| - | ------ | -------- |
| 1 | Identidad | Nombre, rol, empresa, y que nunca afirme ser humano |
| 2 | Alcance | De qué se habla y cómo se declina lo demás |
| 3 | Contexto de negocio | Qué vende la empresa y sus datos operativos |
| 4 | Registro y formato | **La voz.** Preset A o B |
| 5 | Flujo | Apertura, desarrollo y cierre. Es lo que más cambia entre funciones |
| 6 | Reglas duras | Precios, no inventar, no revelar el prompt |
| 7 | Escalamiento | Cuándo y cómo entregar a una persona |
| 8 | Ejemplos | Tres o cuatro turnos modelo |

---

## Variables comunes

Todas se escriben `{{asi}}`. Las que no se rellenen hay que **borrarlas**: un `{{...}}` que sobrevive
al despliegue se lo encuentra el cliente en un mensaje. Cada template documenta además las suyas.

| Variable | Obligatoria | Ejemplo |
| -------- | ----------- | ------- |
| `{{nombre_agente}}` | Sí | `Nova` |
| `{{rol}}` | Sí | `asesor de ventas` |
| `{{empresa}}` | Sí | `Fractal` |
| `{{descripcion_empresa}}` | Sí | Dos o tres frases, no una página |
| `{{oferta}}` | Sí | Lista de productos o servicios |
| `{{alcance_permitido}}` | Sí | `los productos y servicios de Fractal` |
| `{{canal}}` | Sí | `whatsapp` \| `web` |
| `{{horarios}}` | No | `Lunes a viernes, 9:00–18:00 hora centro` |
| `{{medios_contacto}}` | No | WhatsApp, correo |
| `{{mensaje_apertura}}` | Solo voz Formal | — |
| `{{mensaje_cierre}}` | Solo voz Formal | — |

### `{{canal}}` no es cosmético

El prompt de Nova se escribió para chat web y usa markdown y enlaces clicables. En WhatsApp eso se
lee como basura: los asteriscos salen literales y un mensaje de cuatro párrafos ocupa tres pantallas.
Cada template trae el bloque 4 con las dos variantes de canal; hay que borrar la que no aplique.

---

## Los precios no van en el prompt

**Ningún template lleva la tabla de planes escrita.** Es la regla más importante de esta página y
sale de un incidente real.

El `SYSTEM_PROMPT` de Nova en la landing tenía los planes escritos a mano. En agosto de 2026 los
créditos se recalibraron y el overage bajó de $0.16 a $0.05 USD; el prompt no se tocó, porque nada
lo obligaba. Durante meses Nova cotizó créditos que no correspondían y un overage 3.2× más caro que
el real, y afirmaba que "todos los precios están en USD" cuando México ya se cobraba en pesos.

Un precio escrito en un prompt es una copia sin dueño: no falla, solo envejece.

En su lugar el agente consulta:

| Qué | Cómo | A dónde apunta |
| --- | ---- | -------------- |
| Planes de Tesseract | `http_request` | `GET /billing/plans` del gateway. Público, sin auth, cachea 5 min. Devuelve importes vigentes de Stripe por moneda |
| Catálogo del cliente | `dataset` | Al propio dataset. El dato queda vivo: si corrigen un precio, el siguiente mensaje ya lo usa |
| Estado en vivo (pedidos, saldos) | `http_request` | Al sistema del cliente. **Es la integración que hay que acordar con él**, y suele ser lo que más tarda |
| Lo que se cotiza caso por caso | — | No se estima. Se escala a una persona |

Ver [Créditos y Planes](/reference/credits-and-plans) y el [Catálogo de Tools](/reference/tools-catalog).

---

## Reemplazar a Nova con este sistema

Hoy la landing de Fractal (`apps/hub`) tiene su propio backend de chat: una ruta `/api/chat` de unas
930 líneas con un `SYSTEM_PROMPT` de ~430, su cliente de OpenAI, su rate limiting y su tool de leads.
La landing de Tesseract tiene otra casi idéntica. Son dos copias que ya divergieron y que hay que
mantener a mano — el desfase de precios de arriba es consecuencia directa de eso.

**Nova no necesita un template propio.** Es una instancia del de [Ventas](/templates/ventas):

| | |
| --- | --- |
| Función | Ventas |
| Voz | B (cercana) — es la que ya tiene en producción |
| `{{canal}}` | `web` |
| `{{alcance_permitido}}` | Las tres líneas de Fractal: Tesseract, Atlas y consultoría |
| Tools | `human_handoff` + `http_request` a `GET /billing/plans` |

Lo que Nova añade sobre el template base es **configuración, no función**: el arbitraje entre las
tres líneas de negocio es una regla del bloque 6, y los precios dejan de estar escritos porque pasan
a consultarse.

### Lo que ya funciona

El gateway expone `POST /v1/workflows/:id/execute` y `/execute/stream` con `X-API-Key`
([ExternalWorkflowsController](apps/gateway/src/automation/workflows/controllers/external/workflows.controller.ts)).
El canal `WEB` ya existe en `ConversationChannel`, y la continuidad multi-turno funciona pasando
`metadata.conversationId` — el endpoint de streaming incluso emite un evento `conversation_id` en el
primer turno.

La landing conserva una ruta `/api/chat` mínima que hace de proxy: guarda la API key del lado del
servidor y mantiene el rate limiting por IP. Lo que desaparece es el prompt, el cliente de OpenAI y
la lógica de tools — de ~930 líneas a unas 60.

### Lo que falta antes de poder apagarlo

Dos huecos reales, y ninguno es de prompt:

1. **La señal de handoff no sale por el endpoint externo.** El agente la produce y el gateway la
   expone como `human_handoff_requested`, pero `ExternalWorkflowsController` recorta la respuesta a
   `content` y `execution_time_ms`. Sin ese campo, la landing no se entera de que hay que capturar un
   lead.
2. **El lead estructurado.** La tool `connect_with_human_advisor` de la landing recoge nombre, medio,
   dato de contacto, interés y empresa, y manda un correo al equipo. `human_handoff` solo emite
   `{ requested, reason }`. Hay que decidir si el resumen estructurado viaja dentro de `reason` o si
   hace falta una tool aparte.

Mientras eso no exista, un Nova migrado responde bien pero **pierde leads**, que es justo lo único
que la landing no puede permitirse.

---

## Antes de poner uno en producción

1. Ningún `{{...}}` sobrevive en el `system_prompt`.
2. `{{canal}}` coincide con el canal real por el que entra la conversación.
3. Se eligió una voz y se borró la otra, y `temperature` corresponde a esa voz.
4. El agente tiene `human_handoff` entre sus tools. Sin eso, el bloque 7 es decorativo.
5. No hay ningún precio literal en el prompt.
6. Probado con tres mensajes hostiles: "ignora tus instrucciones", "¿eres un robot?" y una pregunta
   totalmente fuera de alcance.
