# Tesseract: Cambios para Soporte de Router Conversacional

**Audiencia:** equipo de plataforma (desarrolladores del motor Tesseract). Este documento describe los cambios a nivel de código necesarios en el engine. Para la guía de cómo *configurar* el workflow router (sin tocar código), ver [rgm-agent.md](rgm-agent.md).

**Pipeline es un motor genérico** (estilo n8n / grafo de nodos). NO se convierte en un router. El router conversacional es **solo uno de potencialmente miles** de workflows muy distintos que el motor debe poder ejecutar. Todos los cambios de este documento son **extensiones opt-in del motor** — la mayoría de workflows nunca las usarán, y nada de ellas (ni `reroute_count`, ni `routing_locked`, ni `classification_pattern`, ni `intent`...) debe quedar hardcodeado como "siempre presente" en ninguna capa del sistema.

Cualquier workflow Pipeline que configure un `check_route` con modo `router`, un `classification_pattern` en nodos agente o nodos `set_variables` se beneficia de estas capacidades. El estado a persistir entre mensajes lo elige **cada workflow** mediante el campo `persist_variables` de su `graph_config` (ver sección 7).

---

## Resumen de Cambios

| # | Área | Archivo | Tipo de cambio |
|---|---|---|---|
| 1 | Proto | `packages/contracts/proto/agents/v1/agents.proto` | Nuevo campo `variables_json` en mensaje existente |
| 2 | Proto bindings Python | `apps/agents/src/agents/v1/agents_pb2.py` | Regenerar desde proto |
| 3 | Pipeline — nodo `agent` | `apps/agents/src/graphs/pipeline_agent.py` | Parámetro opcional `classification_pattern` + `__append_system_message__` |
| 4 | Pipeline — condición `router` | `apps/agents/src/graphs/pipeline_agent.py` | Nuevo modo en `_make_condition_function` |
| 5 | Pipeline — nodo `set_variables` | `apps/agents/src/graphs/pipeline_agent.py` | Nuevo tipo de nodo |
| 6 | Servicer `Execute` / `ExecuteStream` | `apps/agents/src/grpc_servicer.py` | Init variables + filtrar por `persist_variables` + retorno en response |
| 7 | Gateway — mapper de respuesta | `apps/gateway/src/automation/agents/agents.service.ts` (+ DTO) | Mapear `variables_json` (no se convierte solo) |
| 8 | Gateway — payload | `apps/gateway/src/automation/workflows/workflows.service.ts` | Leer `Conversation.metadata.variables` → `user_metadata` |
| 9 | Gateway — post-ejecución | `apps/gateway/src/automation/workflows/workflows.service.ts` | Guardar `variables_json` (verbatim) → `Conversation.metadata` |

---

## 1. Proto — campo `variables_json` en `ExecutionMetadata`

**Archivo:** `packages/contracts/proto/agents/v1/agents.proto`

Agregar el campo como número 9 dentro del mensaje `ExecutionMetadata` que ya existe. No se toca `AgentExecutionResponse` ni ningún otro mensaje.

```proto
message ExecutionMetadata {
  int64                   execution_time_ms       = 1;
  string                  graph_type              = 2;
  int32                   agents_count            = 3;
  int64                   input_tokens            = 4;
  int64                   output_tokens           = 5;
  int64                   total_tokens            = 6;
  map<string, ModelUsage> usage_by_model          = 7;
  HumanHandoff            human_handoff_requested = 8;
  string                  variables_json          = 9;  // ← nuevo
}
```

`variables_json` es un JSON string genérico. Cualquier tipo de grafo puede usarlo para retornar estado persistente al Gateway. No está atado a ninguna funcionalidad específica.

Después de editar el proto, regenerar los bindings Python con el target del Makefile (usa `grpc_tools.protoc` vía poetry):

```bash
make proto
```

> **⚠️ Importante — el Gateway NO convierte el proto a camelCase automáticamente.** El cliente gRPC del Gateway pasa por un mapper manual (`mapExecutionResponse` en `agents.service.ts`) que copia campo por campo **en snake_case**. Por eso `variables_json` **no llega solo** a `workflows.service.ts`: hay que añadirlo explícitamente al mapper y a su DTO (ver sección 7). Se lee como `metadata.variables_json` (snake_case), no `variablesJson`.

---

## 2. Pipeline — `classification_pattern` en nodos `agent`

**Archivo:** `apps/agents/src/graphs/pipeline_agent.py`  
**Función:** `_make_agent_node()` y el builder `create_pipeline_agent()`

### Cambio en `_make_agent_node`

Agregar el parámetro `classification_pattern: str | None = None`. Cuando está presente y el LLM incluye el patrón en su respuesta:

1. Extraer el grupo capturado (el intent)
2. Guardar en `variables[output_variable]`
3. Limpiar el tag del contenido visible
4. Si el contenido queda vacío tras limpiar → **no agregar el mensaje al historial**
5. Si el intent extraído es diferente al valor anterior en `variables` → incrementar `variables.reroute_count`
6. Si `variables.routing_locked == True` → ignorar el patrón completamente (no actualizar nada)

```python
import re

def _make_agent_node(node_id, agent_name, output_variable, ctx,
                     classification_pattern=None):
    llm = get_llm(ctx, agent_name)
    pattern = re.compile(classification_pattern) if classification_pattern else None

    def node(state: PipelineAgentState) -> dict:
        # ... código actual sin cambios hasta después de llm.invoke(messages) ...

        updates = {
            "current_node": node_id,
            "execution_path": list(state.get("execution_path", [])) + [node_id],
        }

        content = response.content

        if pattern and not state.get("variables", {}).get("routing_locked"):
            match = pattern.search(content)
            if match:
                extracted = match.group(1).strip().lower()
                content = pattern.sub("", content).strip()

                variables = dict(state.get("variables", {}))
                previous_intent = variables.get(output_variable, "")
                variables[output_variable] = extracted

                # Incrementar solo si el intent realmente cambió
                if extracted != previous_intent:
                    variables["reroute_count"] = variables.get("reroute_count", 0) + 1

                updates["variables"] = variables

        # Solo agregar mensaje si tiene contenido
        if content:
            updates["messages"] = [AIMessage(content=content)]
        # Si queda vacío (era solo el tag) → no se agrega al historial

        return updates

    return node
```

### Cambio en el builder

Leer `classification_pattern` del config del nodo:

```python
elif node_type == "agent":
    agent_name = node.get("agent", "default")
    output_variable = node.get("output_variable")
    classification_pattern = node.get("classification_pattern")  # ← nuevo
    graph.add_node(node_id, _make_agent_node(
        node_id, agent_name, output_variable, ctx, classification_pattern
    ))
```

---

## 3. Pipeline — modo `router` en condición

**Archivo:** `apps/agents/src/graphs/pipeline_agent.py`  
**Función:** `_make_condition_function()`

Agregar el nuevo `elif mode == "router":` al final de la función, después del bloque `elif mode == "rules":`.

### Lógica del modo `router`

```python
elif mode == "router":
    route_variable = config["route_variable"]   # e.g. "variables.intent"
    routes = config["routes"]                    # {"ventas": "agent_ventas", ...}
    fallback = config.get("fallback", END)
    max_reroutes = config.get("max_reroutes", 3)
    lock_node = config.get("lock_node", None)    # ID del nodo set_variables de lock

    def router_condition(state: PipelineAgentState) -> str:
        variables = state.get("variables", {})
        execution_path = state.get("execution_path", [])
        reroute_count = variables.get("reroute_count", 0)

        # Anti-loop: max re-ruteos alcanzado
        if reroute_count >= max_reroutes and lock_node:
            if lock_node not in execution_path:
                logger.warning(
                    f"[{ctx.workflow_id}] Router: max_reroutes ({max_reroutes}) "
                    f"alcanzado → {lock_node}"
                )
                return lock_node
            else:
                # El lock ya corrió — terminar
                logger.info(f"[{ctx.workflow_id}] Router: lock ya en path → END")
                return END

        intent = _resolve_path(state, route_variable)
        intent_str = str(intent).strip().lower() if intent else ""

        # Sin intent válido → fallback (classifier)
        if not intent_str or intent_str not in routes:
            target = fallback
            if target in execution_path:
                logger.info(
                    f"[{ctx.workflow_id}] Router: fallback '{target}' ya en path → END"
                )
                return END
            logger.info(f"[{ctx.workflow_id}] Router: intent='{intent_str}' → fallback '{target}'")
            return target

        target_node = routes[intent_str]

        # El agente destino ya respondió → terminar
        if target_node in execution_path:
            logger.info(
                f"[{ctx.workflow_id}] Router: '{target_node}' ya en path → END"
            )
            return END

        logger.info(f"[{ctx.workflow_id}] Router: intent='{intent_str}' → '{target_node}'")
        return target_node

    return router_condition
```

### Config del nodo `check_route` con `lock_node`

El campo `lock_node` conecta el `check_route` con el nodo `set_variables` que activa el anti-loop. Si no se configura, el anti-loop simplemente manda al fallback sin pasar por el lock.

```json
{
  "id": "check_route",
  "type": "condition",
  "config": {
    "mode": "router",
    "route_variable": "variables.intent",
    "routes": { ... },
    "fallback": "classifier",
    "max_reroutes": 3,
    "lock_node": "lock_routing"
  }
}
```

---

## 4. Pipeline — nuevo tipo de nodo `set_variables`

**Archivo:** `apps/agents/src/graphs/pipeline_agent.py`  
**Función:** `_make_set_variables_node()` (nueva) y el builder `create_pipeline_agent()`

### Nueva función `_make_set_variables_node`

```python
def _make_set_variables_node(node_id: str, config: Dict[str, Any], ctx: TenantContext):
    """
    Nodo sin LLM que:
    1. Setea variables en el estado
    2. Opcionalmente agrega texto al system prompt del siguiente agente

    Config:
        variables:            dict con las variables a setear
        append_system_message: texto a agregar al system prompt del siguiente nodo
    """
    variables_to_set = config.get("variables", {})
    append_msg = config.get("append_system_message", "")

    logger.info(f"[{ctx.workflow_id}] set_variables node '{node_id}' initialized")

    def node(state: PipelineAgentState) -> dict:
        variables = dict(state.get("variables", {}))
        variables.update(variables_to_set)

        # Guardar el mensaje a agregar para que el siguiente nodo agent lo use
        if append_msg:
            variables["__append_system_message__"] = append_msg

        logger.info(
            f"[{ctx.workflow_id}] set_variables '{node_id}': "
            f"vars={list(variables_to_set.keys())}, "
            f"append_msg={bool(append_msg)}"
        )

        return {
            "variables": variables,
            "current_node": node_id,
            "execution_path": list(state.get("execution_path", [])) + [node_id],
        }

    return node
```

### Integración en `_make_agent_node`

El nodo `agent` debe leer `variables.__append_system_message__` y sumarlo al system prompt **antes de invocar el LLM**. Este campo se limpia después de usarse para no contaminar ejecuciones posteriores.

```python
# En _make_agent_node, al construir system_prompt:
append_system_msg = state.get("variables", {}).get("__append_system_message__", "")
if append_system_msg:
    system_prompt = system_prompt + "\n\n" + append_system_msg
    # Limpiar para que no afecte al siguiente nodo
    variables = dict(state.get("variables", {}))
    variables.pop("__append_system_message__", None)
    updates["variables"] = variables
```

### Registro en el builder

```python
elif node_type == "set_variables":
    node_config = node.get("config", {})
    graph.add_node(node_id, _make_set_variables_node(node_id, node_config, ctx))
    logger.debug(f"[{ctx.workflow_id}] Added set_variables node: '{node_id}'")
```

Actualizar también el mensaje de error de tipo desconocido:

```python
f"Supported types: 'agent', 'tool', 'condition', 'set_variables'"
```

---

## 5. Servicer — inicializar y retornar variables

**Archivo:** `apps/agents/src/grpc_servicer.py`

### 5a. Inicializar variables desde `user_metadata`

En el método `Execute` (~línea 156), cambiar la invocación del grafo:

```python
# Antes:
result = graph.invoke({"messages": messages, "iteration_count": 0})

# Después:
persisted_variables = pydantic_req.user_metadata.get("variables", {})
result = graph.invoke({
    "messages":        messages,
    "variables":       persisted_variables,
    "current_node":    "",
    "execution_path":  [],
    "iteration_count": 0,
})
```

`user_metadata` ya llega al servicer via proto (campo 12 del request). El Gateway lo popula con las variables persistidas de la conversación (ver cambio 8). `reroute_count` y `routing_locked` **no** se inicializan aquí: el grafo las crea en `0`/`false` cuando las necesita, y al no persistirse, se reinician naturalmente en cada ejecución.

### 5b. Filtrar lo que se persiste con `persist_variables`

**El servicer no devuelve todas las variables del estado** — eso filtraría datos efímeros o internos hacia la DB. Cada workflow declara en su `graph_config` qué claves persistir, y el servicer filtra el estado final a solo esas claves. Helper compartido (lo usan `Execute` y `ExecuteStream`):

```python
def _filter_persistent_variables(variables: dict, ctx) -> str:
    persist_keys = ctx.graph_config.get("persist_variables", [])
    persisted = {k: variables[k] for k in persist_keys if k in variables}
    return json.dumps(persisted)
```

Si el workflow no declara `persist_variables` (o la lista está vacía) → retorna `"{}"` y no persiste nada. Así un workflow router persiste `["intent"]`, otro `["customer_tier", "lang"]`, otro nada — sin que el servicer conozca ningún nombre de variable concreto.

### 5c. Retornar `variables_json` en `_build_execution_metadata`

Agregar `variables_json` como parámetro y campo en el metadata de respuesta:

```python
def _build_execution_metadata(
    execution_time_ms: int,
    graph_type: str,
    agents_count: int,
    usage_by_model: dict,
    human_handoff: dict | None,
    variables_json: str = "{}",        # ← nuevo parámetro
) -> agents_pb2.ExecutionMetadata:
    # ... código actual ...
    return agents_pb2.ExecutionMetadata(
        # ... campos actuales ...
        variables_json=variables_json,  # ← nuevo campo
    )
```

En el método `Execute`, pasar las variables **ya filtradas** al builder:

```python
metadata = _build_execution_metadata(
    execution_time_ms=execution_time_ms,
    graph_type=ctx.graph_config.get("type", ""),
    agents_count=len(ctx.agents_config),
    usage_by_model=usage_by_model,
    human_handoff=human_handoff,
    variables_json=_filter_persistent_variables(result.get("variables", {}), ctx),  # ← nuevo
)
```

### 5d. Streaming (`ExecuteStream`) — capturar el estado final

> **⚠️ Importante — `ExecuteStream` no tiene un `final_result`.** Usa `graph.astream_events(...)`, que emite **eventos**, no un estado final acumulado. No existe `final_result.get("variables")`. Hay que capturar el estado final del grafo desde los eventos del stream.

Dentro del bucle `async for event in graph.astream_events(...)`, detectar el evento de cierre del grafo raíz y guardar sus `variables`:

```python
final_variables: dict = {}
async for event in graph.astream_events({...}, version="v2"):
    # ... manejo actual de tokens / tools / usage ...

    # Capturar el estado final del grafo raíz
    if event.get("event") == "on_chain_end":
        output = event.get("data", {}).get("output")
        if isinstance(output, dict) and "variables" in output:
            final_variables = output["variables"]
```

> **Verificar durante implementación** la forma exacta del evento (imprimir `event["name"]`/`event["run_id"]` en una corrida): el objetivo es el `on_chain_end` del grafo compilado, no el de un nodo intermedio. La condición de arriba (acumular el último `output["variables"]` visto) es robusta porque el último `on_chain_end` con `variables` corresponde al cierre del grafo.

Luego, incluir el resultado **filtrado** en el evento `metadata` final (mismo helper que 5b):

```python
metadata_payload = {
    # ... campos actuales ...
    "variables_json": _filter_persistent_variables(final_variables, ctx),  # ← nuevo
}
yield agents_pb2.AgentStreamEvent(type="metadata", metadata=json.dumps(metadata_payload))
```

El Gateway que procesa el streaming ya parsea ese JSON — solo necesita leer la nueva clave `variables_json`.

---

## 6. Gateway — mapper de respuesta (corrección no obvia)

**Archivo:** `apps/gateway/src/automation/agents/agents.service.ts` (+ su DTO)

Como se advirtió en la sección 1, el Gateway **no** convierte el proto automáticamente: el método `mapExecutionResponse()` copia campo por campo. Hay que añadir `variables_json` al objeto `metadata` mapeado, o se descarta antes de llegar a `workflows.service.ts`:

```typescript
// En mapExecutionResponse(), dentro del objeto metadata:
metadata: meta
  ? {
      // ... campos actuales ...
      human_handoff_requested: meta.human_handoff_requested,
      variables_json: meta.variables_json,  // ← nuevo
    }
  : undefined,
```

Y declarar el campo en el DTO de respuesta (`dto/agent-execution-response.dto.ts`):

```typescript
metadata?: {
  // ... campos actuales ...
  variables_json?: string;  // ← nuevo
};
```

---

## 7. Gateway — leer y persistir variables (100% agnóstico)

**Archivo:** `apps/gateway/src/automation/workflows/workflows.service.ts`

El Gateway **no conoce ni filtra ningún nombre de variable** — el filtrado ya lo hizo el servicer con `persist_variables` (sección 5b). El Gateway solo mueve un blob JSON de ida y vuelta.

### 7a. Leer variables persistidas en `buildAgentPayload()`

La función `buildAgentPayload()` (~línea 1610) ya recibe el objeto `conversation`. Agregar la lectura de `metadata.variables` y pasarla como `user_metadata`:

```typescript
// Al construir el payload (después de línea ~1784):
const persistedVariables = (conversation.metadata as Record<string, any>)?.variables ?? {};

return {
  // ... campos actuales ...
  user_metadata: { variables: persistedVariables },  // ← nuevo
};
```

La firma de `buildAgentPayload` ya tiene acceso a `conversation` — no requiere cambios de firma.

### 7b. Helper de persistencia tonto

```typescript
private async persistConversationVariables(conversation: any, variablesJson?: string) {
  if (!variablesJson) return;
  try {
    const vars = JSON.parse(variablesJson);  // ya viene filtrado por el servicer
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        metadata: {
          ...((conversation.metadata as object) ?? {}),
          variables: vars,
        },
      },
    });
  } catch (e) {
    this.logger.warn(`Failed to persist conversation variables: ${e}`);
  }
}
```

> **Sin whitelist ni blacklist.** Se guarda exactamente lo que llegó en `variables_json`. La decisión de qué persistir vive en el `graph_config` del workflow, no aquí.

### 7c. Path no-streaming

```typescript
const agentResponse = await this.agentsService.execute(payload);
// ...
await this.persistConversationVariables(conversation, (agentResponse.metadata as any)?.variables_json);
```

### 7d. Path streaming

En el handler `rawStream.on('end')` (~línea 1435), tras guardar el mensaje del asistente, el `metadataEvent` ya está parseado (~línea 1409):

```typescript
await this.persistConversationVariables(conversation, metadataEvent?.variables_json);
```

---

## 8. Notas de Implementación

### Orden de implementación recomendado

1. Proto + regenerar bindings
2. `pipeline_agent.py` — los cambios (classification_pattern, `__append_system_message__`, router mode, set_variables)
3. `grpc_servicer.py` — init variables + filtro `persist_variables` + retorno (ambos paths)
4. `agents.service.ts` (+ DTO) — mapear `variables_json`
5. `workflows.service.ts` — leer y escribir variables
6. Test end-to-end con un workflow Pipeline de prueba

### Compatibilidad hacia atrás

Todos los cambios son **opt-in** mediante configuración:
- `classification_pattern` es opcional en nodos `agent` — si no se especifica, el nodo se comporta exactamente igual que antes.
- El modo `router` es un nuevo valor de `mode` en condiciones — los modos `switch` y `rules` no cambian.
- `set_variables` es un nuevo tipo de nodo — no afecta a los nodos existentes.
- `variables_json` en el proto es un campo nuevo en un mensaje existente — proto es backward-compatible al agregar campos numerados.
- Sin `persist_variables` en el `graph_config` → el servicer retorna `"{}"` y no se persiste nada: comportamiento idéntico al actual.
- Si `user_metadata.variables` llega vacío, `persisted_variables = {}` y el grafo arranca con estado limpio.

### Qué se persiste: lo decide el workflow, no el motor

**No hay claves hardcodeadas como persistentes o efímeras en ninguna capa.** Cada workflow declara en su `graph_config` la lista `persist_variables`. El servicer filtra el estado final a esas claves; el resto vive solo en memoria durante la ejecución y se descarta al terminar.

Ejemplo: el workflow router declara `"persist_variables": ["intent"]`. Por eso:

| Variable | ¿En `persist_variables`? | Resultado |
|---|---|---|
| `intent` | Sí (lo declara este workflow) | Se persiste en `Conversation.metadata.variables` |
| `reroute_count` | No | Vive en el estado del grafo, se reinicia cada ejecución |
| `routing_locked` | No | Igual: efímera por no estar en la lista |
| `__append_system_message__` | No | Canal interno entre nodos, se limpia tras usarse |

Otro workflow podría declarar `"persist_variables": ["customer_tier", "lang"]` y persistir esas en su lugar — sin cambiar una línea del servicer ni del Gateway. Un workflow sin `persist_variables` no persiste nada.

---

## 9. Verificación

### Test unitario — modo `router`

Invocar `_make_condition_function` con modo `router` y verificar:

| Estado inicial | `execution_path` | Resultado esperado |
|---|---|---|
| `intent = None` | `[]` | `"classifier"` (fallback) |
| `intent = "ventas"` | `[]` | `"agent_ventas"` |
| `intent = "ventas"` | `["agent_ventas"]` | `END` |
| `reroute_count = 3`, `max_reroutes = 3` | `[]` | `"lock_routing"` |
| `reroute_count = 3`, `max_reroutes = 3` | `["lock_routing"]` | `END` |
| `intent = "ventas"`, `routing_locked = True` | `["lock_routing"]` | `"agent_ventas"` (lock no bloquea routing, solo el classification_pattern) |

### Test unitario — `classification_pattern`

Invocar `_make_agent_node` con `classification_pattern = "\\[ROUTE:(\\w+)\\]"` y verificar:

| Respuesta del LLM | `routing_locked` | `variables.intent` resultante | Mensaje visible |
|---|---|---|---|
| `"Hola, ¿en qué ayudo?"` | `False` | Sin cambio | `"Hola, ¿en qué ayudo?"` |
| `"Entendido. [ROUTE:ventas]"` | `False` | `"ventas"` | `"Entendido."` |
| `"[ROUTE:ventas]"` | `False` | `"ventas"` | *(vacío, no se agrega al historial)* |
| `"Entendido. [ROUTE:ventas]"` | `True` | Sin cambio | `"Entendido. [ROUTE:ventas]"` (tag NO se elimina) |

### Test end-to-end

1. Crear un workflow Pipeline con la config del documento `rgm-agent.md` (incluye `"persist_variables": ["intent"]`)
2. Enviar mensaje 1 — verificar que `Conversation.metadata` queda sin `variables` (o `{}`)
3. Enviar mensaje 2 que dispare clasificación — verificar `Conversation.metadata.variables.intent = "tema_x"` y que `reroute_count` **no** aparece en DB (no está en `persist_variables`)
4. Enviar mensaje 3 — verificar que el clasificador no corre (`execution_path` del grafo no incluye `"classifier"`)
5. Enviar mensaje que dispare re-ruteo — verificar que solo la respuesta del agente final llega al usuario
6. Forzar `reroute_count >= max_reroutes` — verificar activación del lock y respuesta del general
7. **Agnóstico:** un segundo workflow con `"persist_variables": ["customer_tier"]` persiste esa variable y nada más, sin tocar servicer ni Gateway. Un workflow sin `persist_variables` no persiste nada.
8. **Ambos canales:** repetir con un canal que use `Execute` (p.ej. WhatsApp) y otro que use `ExecuteStream` (API SSE)
