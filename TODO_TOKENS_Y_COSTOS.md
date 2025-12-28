# TODO: Implementar Cálculo de Tokens y Costos

## Resumen del Cambio de Arquitectura

**ANTES**: Gateway calculaba costos (perdía tiempo en cálculos)  
**DESPUÉS**: Python agents calcula todo, Gateway solo persiste en BD

---

## 📋 Archivos con TODOs

### 1. **Python - Servicio de Agents** 

#### `/apps/agents/src/api/deps.py`
- ✅ Agregar campo `model_pricing` en `AgentExecutionRequest`
- ✅ Gateway debe enviar precios por modelo para que Python calcule
- ✅ Documentar campos de usage en `AgentExecutionResponse.metadata`

#### `/apps/agents/src/api/routes.py` - Línea ~340
- ✅ **EXTRAER usage_metadata** del último AIMessage en el resultado
- ✅ **CALCULAR cost** usando `input_cost_per_million` y `output_cost_per_million`
- ✅ **AGREGAR a metadata**: `input_tokens`, `output_tokens`, `total_tokens`, `cost`

**Código de referencia para extraer tokens:**
```python
# Buscar el último AIMessage con usage_metadata
usage_metadata = None
for msg in reversed(output_messages):
    if hasattr(msg, 'usage_metadata') and msg.usage_metadata:
        usage_metadata = msg.usage_metadata
        break

input_tokens = usage_metadata.get("input_tokens", 0) if usage_metadata else 0
output_tokens = usage_metadata.get("output_tokens", 0) if usage_metadata else 0
total_tokens = input_tokens + output_tokens
```

**Código de referencia para calcular costo:**
```python
model_config = ctx.model_configs.get("default", {})
input_cost_per_million = model_config.get("input_cost_per_million", 0)
output_cost_per_million = model_config.get("output_cost_per_million", 0)

cost = (
    (input_tokens / 1_000_000 * input_cost_per_million) +
    (output_tokens / 1_000_000 * output_cost_per_million)
)
```

---

### 2. **TypeScript - Gateway**

#### `/apps/gateway/src/agents/dto/agent-execution-request.dto.ts`
- ✅ Agregar campos `input_cost_per_million` y `output_cost_per_million` en `ModelConfigDto`

#### `/apps/gateway/src/agents/dto/agent-execution-response.dto.ts`
- ✅ Agregar campos `input_tokens` y `output_tokens` en `ExecutionMetadataDto`
- ✅ Documentar que `cost` ya viene calculado desde Python

#### `/apps/gateway/src/workflows/workflows.service.ts` - Línea ~495
- ✅ **CREAR mapa de precios** por modelo (constante o desde BD)
- ✅ **AGREGAR pricing** a cada modelo en `modelsConfig` antes de enviar a Python
- ✅ **PERSISTIR tokens y costos** sin calcular (ya vienen desde Python)
  - Actualizar `Execution` con `totalTokens` y `totalCost`
  - Actualizar `Conversation` acumulando tokens y costos
  - Actualizar `Message` del asistente con sus tokens

**Código de referencia para pricing:**
```typescript
const MODEL_PRICING = {
    'gpt-4o': { input_cost_per_million: 2.5, output_cost_per_million: 10.0 },
    'gpt-4o-mini': { input_cost_per_million: 0.15, output_cost_per_million: 0.6 },
    'claude-3-5-sonnet-20241022': { input_cost_per_million: 3.0, output_cost_per_million: 15.0 },
    'claude-3-5-haiku-20241022': { input_cost_per_million: 0.8, output_cost_per_million: 4.0 },
};

// Agregar pricing a cada modelo configurado
for (const [key, modelConfig] of Object.entries(modelsConfig)) {
    const modelName = modelConfig.model;
    const pricing = MODEL_PRICING[modelName];
    if (pricing) {
        modelConfig.input_cost_per_million = pricing.input_cost_per_million;
        modelConfig.output_cost_per_million = pricing.output_cost_per_million;
    }
}
```

**Código de referencia para persistir:**
```typescript
const { input_tokens, output_tokens, total_tokens, cost } = agentResponse.metadata || {};

// Actualizar Execution
await this.prisma.execution.update({
    where: { id: execution.id },
    data: {
        totalTokens: total_tokens || 0,
        totalCost: cost || 0,
    },
});

// Actualizar Conversation (acumulado)
await this.prisma.conversation.update({
    where: { id: conversation.id },
    data: {
        totalTokens: { increment: total_tokens || 0 },
        totalCost: { increment: cost || 0 },
    },
});

// Actualizar Message del asistente
if (lastMessage && lastMessage.role === 'assistant') {
    await this.prisma.message.update({
        where: { id: savedMessage.id },
        data: {
            inputTokens: input_tokens || 0,
            outputTokens: output_tokens || 0,
            cost: cost || 0,
        },
    });
}
```

---

## 🎯 Flujo Completo

1. **Gateway** (`workflows.service.ts`):
   - Crea el payload con configuración del agente
   - **AGREGA pricing** a cada modelo en `modelsConfig`
   - Envía payload a Python agents

2. **Python** (`routes.py`):
   - Ejecuta el agente con LangGraph
   - **EXTRAE tokens** del resultado (`usage_metadata`)
   - **CALCULA cost** usando los precios recibidos
   - **RETORNA metadata** con: `input_tokens`, `output_tokens`, `total_tokens`, `cost`

3. **Gateway** (`workflows.service.ts`):
   - Recibe respuesta con todos los datos calculados
   - **PERSISTE en BD** sin calcular nada:
     - `Execution`: `totalTokens`, `totalCost`
     - `Conversation`: acumular tokens y costos
     - `Message`: tokens y costo del mensaje

---

## ✅ Beneficios

1. **Performance**: Gateway no pierde tiempo calculando
2. **Precisión**: Python tiene acceso directo al `usage_metadata` de LangGraph
3. **Separación de responsabilidades**: Lógica de agentes en Python, persistencia en Gateway
4. **Flexibilidad**: Fácil agregar nuevos modelos solo actualizando el mapa de precios

---

## 📝 Notas Importantes

- Los precios están en **USD por millón de tokens**
- El costo final debe redondearse a 6 decimales
- Si un modelo no tiene pricing configurado, usar 0 (no fallar)
- Los tokens deben guardarse tanto a nivel de Execution como de Conversation (acumulado)
- El campo `usage_metadata` solo existe en el último AIMessage después de ejecutar el modelo

---

## 🔗 Referencias

- LangGraph usage_metadata: https://python.langchain.com/docs/how_to/chat_model_rate_limiting
- OpenAI pricing: https://openai.com/api/pricing/
- Anthropic pricing: https://www.anthropic.com/pricing
