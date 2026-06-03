# Tesseract: Cambios para Soporte de Router Conversacional

Documento técnico para el equipo de plataforma. Describe todos los cambios necesarios en Tesseract para soportar el workflow de router conversacional con persistencia de estado entre mensajes.

Estos cambios son **genéricos** — no están atados al cliente específico. Cualquier workflow Pipeline que configure un `check_route` con modo `router`, `classification_pattern` en nodos agente o nodos `set_variables` se beneficia automáticamente.

---

## Resumen de Cambios

| # | Área | Archivo | Tipo de cambio |
|---|---|---|---|
| 1 | Proto | `packages/contracts/proto/agents/v1/agents.proto` | Nuevo campo en mensaje existente |
| 2 | Proto bindings Python | `apps/agents/src/agents/v1/agents_pb2.py` | Regenerar desde proto |
| 3 | Pipeline — nodo `agent` | `apps/agents/src/graphs/pipeline_agent.py` | Parámetro opcional `classification_pattern` |
| 4 | Pipeline — condición `router` | `apps/agents/src/graphs/pipeline_agent.py` | Nuevo modo en `_make_condition_function` |
| 5 | Pipeline — nodo `set_variables` | `apps/agents/src/graphs/pipeline_agent.py` | Nuevo tipo de nodo |
| 6 | Servicer `Execute` | `apps/agents/src/grpc_servicer.py` | Init variables + retorno en response |
| 7 | Gateway — payload | `apps/gateway/src/automation/workflows/workflows.service.ts` | Leer `Conversation.metadata` → `user_metadata` |
| 8 | Gateway — post-ejecución | `apps/gateway/src/automation/workflows/workflows.service.ts` | Guardar `variables_json` → `Conversation.metadata` |

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

Después de editar el proto, regenerar los bindings Python:

```bash
cd apps/agents
python -m grpc_tools.protoc \
  -I../../packages/contracts/proto \
  --python_out=src \
  --grpc_python_out=src \
  packages/contracts/proto/agents/v1/agents.proto
```

El Gateway (NestJS) deserializa el proto automáticamente mediante el cliente gRPC existente — NestJS convierte `variables_json` a `variablesJson` en camelCase.

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

`user_metadata` ya llega al servicer via proto (campo 12 del request). El Gateway lo popula con las variables persistidas de la conversación (ver cambio 7).

### 5b. Retornar variables en `_build_execution_metadata`

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

En el método `Execute`, pasar las variables al builder:

```python
metadata = _build_execution_metadata(
    execution_time_ms=execution_time_ms,
    graph_type=ctx.graph_config.get("type", ""),
    agents_count=len(ctx.agents_config),
    usage_by_model=usage_by_model,
    human_handoff=human_handoff,
    variables_json=json.dumps(result.get("variables", {})),  # ← nuevo
)
```

### 5c. Streaming (`ExecuteStream`)

El servicer de streaming ya emite un evento de tipo `"metadata"` al final con un JSON string. Incluir `variables_json` en ese JSON:

```python
# Al emitir el evento metadata final en ExecuteStream:
metadata_payload = {
    # ... campos actuales ...
    "variables_json": json.dumps(final_result.get("variables", {})),  # ← nuevo
}
yield agents_pb2.AgentStreamEvent(
    type="metadata",
    metadata=json.dumps(metadata_payload),
)
```

El Gateway que procesa el streaming ya parsea ese JSON — solo necesita leer la nueva clave `variables_json`.

---

## 6. Gateway — leer y escribir variables

**Archivo:** `apps/gateway/src/automation/workflows/workflows.service.ts`

### 6a. Leer variables persistidas en `buildAgentPayload()`

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

### 6b. Guardar variables después de la ejecución — path no-streaming

Después de `agentsService.execute()` (~línea 966), extraer y guardar `variablesJson`:

```typescript
const agentResponse = await this.agentsService.execute(payload);

// Guardar variables persistentes en Conversation.metadata
const variablesJson = (agentResponse.metadata as any)?.variablesJson;
if (variablesJson) {
  try {
    const newVariables = JSON.parse(variablesJson);
    // Solo persistir `intent` — reroute_count y routing_locked son de ejecución
    const persistentVars: Record<string, any> = {};
    if (newVariables.intent !== undefined) {
      persistentVars.intent = newVariables.intent;
    }
    if (Object.keys(persistentVars).length > 0) {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          metadata: {
            ...((conversation.metadata as object) ?? {}),
            variables: persistentVars,
          },
        },
      });
    }
  } catch (e) {
    this.logger.warn(`Failed to persist conversation variables: ${e}`);
  }
}
```

> **Importante:** Solo se persiste `intent`. Las variables `reroute_count` y `routing_locked` son efímeras — se reinician en cada ejecución y nunca se guardan en DB.

### 6c. Guardar variables después de la ejecución — path streaming

En el bloque de post-procesamiento del streaming (~línea 1435), después de que el stream termina, aplicar la misma lógica usando el evento `"metadata"` parseado:

```typescript
// El metadataEvent ya se parsea del stream. Agregar:
const variablesJson = metadataEvent?.variables_json;
if (variablesJson) {
  // Misma lógica que en 6b
}
```

---

## 7. Notas de Implementación

### Orden de implementación recomendado

1. Proto + regenerar bindings
2. `pipeline_agent.py` — los tres cambios (classification_pattern, router mode, set_variables)
3. `grpc_servicer.py` — init variables + retorno
4. `workflows.service.ts` — leer y escribir variables
5. Test end-to-end con un workflow Pipeline de prueba

### Compatibilidad hacia atrás

Todos los cambios son **opt-in** mediante configuración:
- `classification_pattern` es opcional en nodos `agent` — si no se especifica, el nodo se comporta exactamente igual que antes.
- El modo `router` es un nuevo valor de `mode` en condiciones — los modos `switch` y `rules` no cambian.
- `set_variables` es un nuevo tipo de nodo — no afecta a los nodos existentes.
- `variables_json` en el proto es un campo nuevo en un mensaje existente — proto es backward-compatible al agregar campos numerados.
- Si `user_metadata.variables` llega vacío (workflows que no usan persistencia), `persisted_variables = {}` y el comportamiento es idéntico al actual.

### Variables que se persisten vs variables efímeras

| Variable | Persiste en DB | Motivo |
|---|---|---|
| `intent` | Sí | Define el especialista activo entre mensajes |
| `reroute_count` | No | Contador de seguridad por ejecución, se reinicia |
| `routing_locked` | No | Estado de anti-loop por ejecución, se reinicia |
| `__append_system_message__` | No | Canal interno entre nodos, se limpia tras usarse |
| Cualquier otra variable custom | Sí | Si está presente en `variables` al final de la ejecución |

---

## 8. Verificación

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

1. Crear un workflow Pipeline con la config del documento `rgm-agent.md`
2. Enviar mensaje 1 — verificar que `Conversation.metadata` queda `{}`
3. Enviar mensaje 2 que dispare clasificación — verificar `Conversation.metadata.variables.intent = "tema_x"`
4. Enviar mensaje 3 — verificar que el clasificador no corre (`execution_path` del grafo no incluye `"classifier"`)
5. Enviar mensaje que dispare re-ruteo — verificar que solo la respuesta del agente final llega al usuario
6. Forzar `reroute_count >= max_reroutes` — verificar activación del lock y respuesta del general
