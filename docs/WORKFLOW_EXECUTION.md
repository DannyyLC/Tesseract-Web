# Guía de Ejecución de Workflows

Esta guía explica cómo levantar el entorno completo y ejecutar workflows tanto en modo síncrono como en streaming.

## 1. Prerrequisitos y Configuración

Antes de ejecutar cualquier request, asegúrate de que la base de datos esté lista y los servicios corriendo.

### A. Levantar Infraestructura (Base de Datos)

Si no tienes los contenedores corriendo:

```bash
npm run docker:up
```

### B. Popular Base de Datos (Seed)

Ejecuta el seed para crear la organización `Acme Corp`, el API Key y el workflow de prueba "Calculadora Rápida".

```bash
npm run prisma:seed
```

### C. Iniciar Servicio de Agentes (Python)

Este servicio ejecuta la lógica del grafo (LangGraph).
**Nota:** Asegúrate de tener el entorno virtual activo o usar `poetry`.

```bash
cd apps/agents
poetry run python src/main.py
```

_El servicio correrá en el puerto 8000._

### D. Iniciar Gateway (NestJS)

En otra terminal, corre el Gateway principal.

```bash
npm run dev:gateway
```

_El servicio correrá en el puerto 3000._

---

## 2. Obtener Credenciales y IDs

El seed crea datos por defecto que puedes usar de inmediato:

- **API Key (Acme Corp):** `ak_live_acme_prod_xyz789abc123def456ghi`
- **Workflow ID:** Este ID se genera dinámicamente. Para obtenerlo:
  1.  Ejecuta `npm run prisma:studio`.
  2.  Ve a la tabla `Workflow`.
  3.  Copia el ID del workflow llamado **"Calculadora Rápida"**.

---

## 3. Ejecutar Workflow

A continuación se muestran los comandos `curl` para probar los endpoints.
**Reemplaza `{WORKFLOW_ID}`** con el UUID que obtuviste en el paso anterior.

### A. Ejecución Síncrona (Standard JSON)

Ideal para integraciones server-to-server donde esperas la respuesta completa.

```bash
curl -X POST "http://localhost:3000/api/workflows/{WORKFLOW_ID}/execute" \
  -H "X-API-Key: ak_live_acme_prod_xyz789abc123def456ghi" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "message": "Calcula el 15% de 8500"
    }
  }'
```

**Respuesta esperada:**

```json
{
  "content": "El 15% de 8500 es 1275.",
  "metadata": {
    "execution_time_ms": 2055
  }
}
```

### B. Ejecución Streaming (Server-Sent Events)

Ideal para interfaces de chat en tiempo real.

```bash
curl -N -X POST "http://localhost:3000/api/workflows/{WORKFLOW_ID}/execute/stream" \
  -H "X-API-Key: ak_live_acme_prod_xyz789abc123def456ghi" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "message": "Calcula el 15% de 8500"
    }
  }'
```

**Respuesta esperada (Stream):**
Recibirás eventos SSE en tiempo real.

```
data: "El"

data: " 15%"

data: " de"
...
```

---

## Solución de Problemas

- **Error de conexión (ECONNREFUSED):** Asegúrate de que tanto el Gateway (3000) como los Agentes (8000) estén corriendo.
- **403 Forbidden:** Verifica que estás usando la API Key correcta creada por el seed.
- **404 Not Found:** Verifica que el `{WORKFLOW_ID}` copiado sea correcto y pertenezca a la misma organización de la API Key (Acme Corp).
