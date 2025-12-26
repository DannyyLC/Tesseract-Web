# 🧪 Guía de Prueba - Flujo Completo con Calculator

## 📋 Resumen

Este documento explica cómo probar el flujo completo de ejecución de workflows con agentes usando la herramienta **Calculator** (que no requiere credenciales).

---

## ✅ Pre-requisitos

1. **Base de datos PostgreSQL** funcionando
2. **Node.js** y **npm** instalados
3. **Python 3.11+** instalado
4. **Variables de entorno** configuradas

---

## 🚀 Paso 1: Preparar la Base de Datos

### 1.1 Ejecutar las migraciones de Prisma

```bash
cd packages/database
npx prisma migrate dev
```

### 1.2 Ejecutar el seed para crear datos de prueba

```bash
cd packages/database
npx prisma db seed
```

**¿Qué crea el seed?**
- ✅ 2 Organizaciones (Acme Corp y TechStart Inc)
- ✅ 2 Usuarios administradores
- ✅ 3 API Keys para autenticación
- ✅ ToolCatalog para "calculator" con 3 funciones
- ✅ TenantTool vinculando calculator a Acme Corp
- ✅ 2 Workflows de prueba configurados
- ✅ Tags para organización

**Credenciales generadas:**
```
Organización: Acme Corp
Email: admin@acme.com
Password: Password123!
API Key: ak_live_acme_prod_xyz789abc123def456ghi
```

---

## 🚀 Paso 2: Iniciar el Servicio de Agents (Python)

### 2.1 Instalar dependencias

```bash
cd apps/agents
pip install -r requirements.txt
# O si usas poetry:
poetry install
```

### 2.2 Configurar variables de entorno

Crear archivo `.env` en la raíz del proyecto con:

```env
OPENAI_API_KEY=tu_api_key_de_openai_aqui
```

### 2.3 Iniciar el servicio

```bash
cd apps/agents
python src/main.py
```

**El servicio debería estar corriendo en:** `http://localhost:8000`

**Verificar que funciona:**
```bash
curl http://localhost:8000/health
```

Deberías ver:
```json
{
  "status": "healthy",
  "service": "tesseract-agents",
  "version": "0.1.0"
}
```

---

## 🚀 Paso 3: Iniciar el Gateway (NestJS)

### 3.1 Instalar dependencias

```bash
cd apps/gateway
npm install
```

### 3.2 Configurar variables de entorno

Asegúrate de tener en el `.env`:

```env
# Base de datos
DATABASE_URL="postgresql://usuario:password@localhost:5432/tesseract"

# Servicio de Agents
AGENTS_SERVICE_URL=http://localhost:8000
AGENTS_SERVICE_TIMEOUT=30000

# JWT
JWT_SECRET=tu_secret_super_seguro_aqui

# OpenAI (si es necesario)
OPENAI_API_KEY=tu_api_key_de_openai_aqui
```

### 3.3 Iniciar el servicio

```bash
cd apps/gateway
npm run start:dev
```

**El Gateway debería estar corriendo en:** `http://localhost:3000`

---

## 🧪 Paso 4: Probar el Flujo Completo

### 4.1 Obtener el Workflow ID

Después de ejecutar el seed, verás en la consola:

```
🤖 WORKFLOWS PARA PRUEBAS:

1. Agente Matemático - Calculator
   ID: <workflow-id-aqui>
   Tools: Calculator (todas las funciones)
   Prueba: "¿Cuánto es 15% de 2350?"
```

Copia el `workflow-id`.

### 4.2 Ejecutar el workflow con cURL

```bash
curl -X POST http://localhost:3000/api/v1/workflows/<WORKFLOW_ID>/execute \
  -H "Content-Type: application/json" \
  -H "x-api-key: ak_live_acme_prod_xyz789abc123def456ghi" \
  -d '{
    "input": {
      "message": "¿Cuánto es 15% de 2350?"
    },
    "metadata": {
      "channel": "api"
    }
  }'
```

### 4.3 Otros ejemplos de mensajes para probar

**Cálculo básico:**
```json
{
  "input": {
    "message": "Calcula (25 + 35) * 2"
  },
  "metadata": {
    "channel": "api"
  }
}
```

**Porcentaje:**
```json
{
  "input": {
    "message": "¿Cuánto es el 20% de 500?"
  },
  "metadata": {
    "channel": "api"
  }
}
```

**Conversión de moneda (mock):**
```json
{
  "input": {
    "message": "Convierte 100 USD a MXN"
  },
  "metadata": {
    "channel": "api"
  }
}
```

### 4.4 Respuesta esperada

Deberías recibir algo como:

```json
{
  "id": "execution-uuid",
  "status": "completed",
  "workflowId": "workflow-uuid",
  "conversationId": "conversation-uuid",
  "result": {
    "messages": [
      {
        "role": "assistant",
        "content": "15% de 2350 es 352.5"
      }
    ],
    "conversation_id": "conversation-uuid",
    "execution_time_seconds": 2.5
  },
  "startedAt": "2025-12-26T...",
  "finishedAt": "2025-12-26T...",
  "duration": 2
}
```

---

## 🔍 Verificar en la Base de Datos

### Ver las conversaciones creadas

```sql
SELECT * FROM conversations ORDER BY "createdAt" DESC LIMIT 5;
```

### Ver los mensajes de una conversación

```sql
SELECT role, content, "createdAt" 
FROM messages 
WHERE "conversationId" = '<conversation-id>'
ORDER BY "createdAt" ASC;
```

### Ver las ejecuciones

```sql
SELECT id, status, result, "startedAt", "finishedAt", duration
FROM executions 
ORDER BY "createdAt" DESC 
LIMIT 5;
```

---

## 🐛 Troubleshooting

### Error: "Agents service is not available"

**Causa:** El servicio de Python no está corriendo.

**Solución:**
```bash
cd apps/agents
python src/main.py
```

### Error: "Workflow not found"

**Causa:** El workflow ID es incorrecto o no ejecutaste el seed.

**Solución:**
```bash
cd packages/database
npx prisma db seed
```

### Error: "Invalid API Key"

**Causa:** La API Key es incorrecta o no existe.

**Solución:** Usa la API Key generada por el seed:
```
ak_live_acme_prod_xyz789abc123def456ghi
```

### Error: "OpenAI API key not found"

**Causa:** No configuraste la variable de entorno.

**Solución:** Agrega al `.env`:
```env
OPENAI_API_KEY=sk-proj-...
```

### El agente no usa la herramienta Calculator

**Causa:** El modelo no detectó que necesita hacer un cálculo.

**Solución:** Prueba con preguntas más explícitas:
- ❌ "Dame un número"
- ✅ "Calcula 15% de 2350"
- ✅ "¿Cuánto es 25 + 35?"

---

## 📊 Logs útiles

### Ver logs del Gateway (NestJS)

El servicio imprime logs detallados sobre:
- Request recibido
- Payload construido para agents
- Response del servicio de agents
- Mensajes guardados en BD

### Ver logs del Agents Service (Python)

El servicio imprime logs sobre:
- Tools cargadas
- Ejecución del agente
- Tool calls realizados
- Response generado

---

## 🎯 Próximos pasos

Una vez que confirmes que funciona con Calculator:

1. ✅ Agregar más tools al catálogo (Google Calendar, HubSpot, etc.)
2. ✅ Implementar flujo OAuth para obtener credenciales
3. ✅ Probar con tools que requieren autenticación
4. ✅ Implementar límites de conversación (maxMessages, maxTokens, etc.)
5. ✅ Agregar webhooks para notificaciones

---

## 📞 ¿Necesitas ayuda?

Si algo no funciona, revisa:

1. **Logs del Gateway**: `apps/gateway/logs/`
2. **Logs del Agents Service**: En la terminal donde lo ejecutaste
3. **Estado de la BD**: Usa Prisma Studio
   ```bash
   cd packages/database
   npx prisma studio
   ```

---

**¡Listo para probar! 🚀**
