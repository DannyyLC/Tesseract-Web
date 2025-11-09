# Guía de Testing con Postman - Todos los Endpoints

Esta guía te llevará paso a paso para probar **TODOS** los endpoints del Gateway en orden lógico.

**Base URL:** `http://localhost:3000/api`

---

## CONFIGURACIÓN INICIAL DE POSTMAN

### 1. Habilitar cookies en Postman
**En Postman v10+, las cookies están habilitadas por defecto**, pero necesitas:

1. **NO uses Postman Web** - Descarga la app de escritorio (las cookies httpOnly no funcionan en la versión web)
2. Ve a **Settings** (arriba a la derecha) → **Cookies**
3. Asegúrate que **"Capture cookies and add to cookie jar"** esté activado
4. En **General** → Desactiva **"Automatically follow redirects"** (opcional)

**Verificar cookies:**
- Después de hacer login, haz clic en **"Cookies"** (debajo del botón Send)
- Deberías ver el dominio `localhost` con las cookies

### 2. Crear colección
1. New Collection → Nombre: "Workflow Gateway API"
2. En la pestaña **Variables**, agregar:
   - Variable: `base_url` → Value: `http://localhost:3000/api`
   - Variable: `admin_key` → Value: `change-this-to-a-random-generated-key-for-admin-operations`

### 3. Configurar cookies automáticas (IMPORTANTE)
Postman manejará las cookies automáticamente, pero asegúrate de:
- Usar la **misma colección** para todas las peticiones
- Las cookies se guardarán en **Cookies** (debajo de **Send**)

---

## ORDEN DE PRUEBAS

```
1. Crear Super Admin (Script)
2. Login
3. Auth/Me
4. Crear API Key
5. Listar API Keys
6. Ver API Key específica
7. Crear Workflow (con JWT)
8. Listar Workflows
9. Ver Workflow específico
10. Ejecutar Workflow (con API Key) → Guarda execution_id
11. Listar Executions
12. Ver Execution específica
13. Estadísticas de Executions
14. Cancelar Execution (opcional)
15. Actualizar Workflow
16. Actualizar API Key
18. Admin - Crear Usuario → Guarda new_user_id
19. Admin - Listar Usuarios (con filtros)
20. Admin - Ver Usuario específico
21. Admin - Actualizar Usuario (cambiar plan)
22. Admin - Cambiar contraseña de usuario
23. Refresh Token
24. Logout
25. Login de nuevo
26. Logout All
27. Admin - Reactivar Usuario (después de eliminar)
28. Admin - Eliminar Usuario
29. Eliminar API Key
30. Eliminar Workflow
```

---

## PASO A PASO - ENDPOINTS

### PASO 0: Crear Super Admin (Terminal)

**Antes de empezar**, necesitas crear un usuario admin desde la terminal:

```bash
cd /WorkflowAutomation/apps/gateway
npx ts-node src/scripts/create-super-admin.ts
```

Esto creará un usuario con:
- Email: `admin@example.com`
- Password: `Admin123!`
- Plan: `admin`

---

## 1️⃣ **POST - Login** (Obtener tokens en cookies)

**URL:** `{{base_url}}/auth/login`

**Method:** `POST`

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "email": "admin@example.com",
  "password": "Admin123!"
}
```

**Respuesta esperada (200 OK):**
```json
{
  "user": {
    "id": "uuid-del-usuario",
    "name": "Super Admin",
    "email": "admin@example.com",
    "plan": "admin",
    "isActive": true,
    "createdAt": "2025-11-07T..."
  }
}
```

**Verificar cookies:**
- Haz clic en **Cookies** (debajo del botón Send)
- Deberías ver:
  - `accessToken` (httpOnly, 15 min)
  - `refreshToken` (httpOnly, 7 días)

**Guardar en variables de Postman:**
En la pestaña **Tests** de la petición, agrega:
```javascript
const response = pm.response.json();
pm.collectionVariables.set("user_id", response.user.id);
```

---

## 2️⃣ **GET - Auth/Me** (Verificar sesión)

**URL:** `{{base_url}}/auth/me`

**Method:** `GET`

**Headers:**
```
(ninguno necesario - las cookies se envían automáticamente)
```

**Body:** (ninguno)

**Respuesta esperada (200 OK):**
```json
{
  "id": "uuid",
  "name": "Super Admin",
  "email": "admin@example.com",
  "plan": "admin",
  "maxWorkflows": 999999,
  "maxExecutionsPerDay": 999999,
  "isActive": true,
  "region": "us-central",
  "metadata": {}
}
```

---

## 3️⃣ **POST - Crear API Key** (Con JWT en cookie)

**URL:** `{{base_url}}/api-keys`

**Method:** `POST`

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "name": "Production API Key",
  "scopes": ["workflows:read", "workflows:execute"]
}
```

**Respuesta esperada (201 Created):**
```json
{
  "id": "uuid-del-api-key",
  "name": "Production API Key",
  "apiKey": "ak_live_abc123xyz...",  // GUARDA ESTO - Solo se muestra aquí
  "keyPrefix": "ak_live_ab",
  "isActive": true,
  "scopes": ["workflows:read", "workflows:execute"],
  "expiresAt": null,
  "createdAt": "2025-11-07T..."
}
```

**MUY IMPORTANTE - Guardar API Key:**
En la pestaña **Tests**, agrega:
```javascript
const response = pm.response.json();
pm.collectionVariables.set("api_key", response.apiKey);
pm.collectionVariables.set("api_key_id", response.id);
```

---

## 4️⃣ **GET - Listar API Keys**

**URL:** `{{base_url}}/api-keys`

**Method:** `GET`

**Headers:** (ninguno)

**Respuesta esperada (200 OK):**
```json
[
  {
    "id": "uuid",
    "name": "Production API Key",
    "keyPrefix": "ak_live_ab",  // ← Solo prefijo, no el valor completo
    "isActive": true,
    "lastUsedAt": null,
    "expiresAt": null,
    "createdAt": "2025-11-07T...",
    "updatedAt": "2025-11-07T..."
  }
]
```

---

## 5️⃣ **GET - Ver API Key específica**

**URL:** `{{base_url}}/api-keys/{{api_key_id}}`

**Method:** `GET`

**Headers:** (ninguno)

**Respuesta esperada (200 OK):**
```json
{
  "id": "uuid",
  "name": "Production API Key",
  "keyPrefix": "ak_live_ab",
  "isActive": true,
  "lastUsedAt": null,
  "expiresAt": null,
  "scopes": ["workflows:read", "workflows:execute"],
  "createdAt": "2025-11-07T...",
  "updatedAt": "2025-11-07T..."
}
```

---

## 6️⃣ **POST - Crear Workflow** (Con JWT)

**URL:** `{{base_url}}/workflows`

**Method:** `POST`

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "name": "Mi Primer Workflow",
  "description": "Workflow de prueba desde Postman",
  "config": {
    "type": "n8n",
    "webhookUrl": "https://n8n.example.com/webhook/test",
    "method": "POST"
  },
  "tags": ["test", "postman"],
  "isActive": true
}
```

**Respuesta esperada (201 Created):**
```json
{
  "id": "uuid-del-workflow",
  "name": "Mi Primer Workflow",
  "description": "Workflow de prueba desde Postman",
  "config": {
    "type": "n8n",
    "webhookUrl": "https://n8n.example.com/webhook/test",
    "method": "POST"
  },
  "tags": ["test", "postman"],
  "isActive": true,
  "isPaused": false,
  "version": 1,
  "createdAt": "2025-11-07T...",
  "updatedAt": "2025-11-07T..."
}
```

** Guardar workflow ID:**
```javascript
const response = pm.response.json();
pm.collectionVariables.set("workflow_id", response.id);
```

---

## 7️⃣ **GET - Listar Workflows**

**URL:** `{{base_url}}/workflows`

**Method:** `GET`

**Headers:** (ninguno)

**Query Params (opcionales):**
- `includeDeleted=true` para incluir workflows eliminados

**Respuesta esperada (200 OK):**
```json
[
  {
    "id": "uuid",
    "name": "Mi Primer Workflow",
    "description": "Workflow de prueba desde Postman",
    "isActive": true,
    "isPaused": false,
    "version": 1,
    "createdAt": "2025-11-07T..."
  }
]
```

---

## 8️⃣ **GET - Ver Workflow específico**

**URL:** `{{base_url}}/workflows/{{workflow_id}}`

**Method:** `GET`

**Headers:** (ninguno)

**Respuesta esperada (200 OK):**
```json
{
  "id": "uuid",
  "name": "Mi Primer Workflow",
  "description": "Workflow de prueba desde Postman",
  "config": {
    "type": "n8n",
    "webhookUrl": "https://n8n.example.com/webhook/test",
    "method": "POST"
  },
  "tags": ["test", "postman"],
  "isActive": true,
  "isPaused": false,
  "version": 1,
  "createdAt": "2025-11-07T...",
  "updatedAt": "2025-11-07T...",
  "executions": []  // Lista de ejecuciones
}
```

---

## 9️⃣ **POST - Ejecutar Workflow** (Con API Key)

**IMPORTANTE:** Esta petición NO usa cookies, usa **API Key** en el header.

**URL:** `{{base_url}}/workflows/{{workflow_id}}/execute`

**Method:** `POST`

**Headers:**
```
Content-Type: application/json
X-API-Key: {{api_key}}
```

**Body (raw JSON):**
```json
{
  "input": {
    "leadName": "Juan Pérez",
    "email": "juan@example.com",
    "phone": "+52 123 456 7890",
    "message": "Prueba desde Postman"
  },
  "metadata": {
    "source": "postman",
    "campaign": "test-2025"
  }
}
```

**Respuesta esperada (201 Created):**
```json
{
  "id": "execution-uuid",
  "workflowId": "workflow-uuid",
  "status": "completed",
  "startedAt": "2025-11-07T10:30:00Z",
  "finishedAt": "2025-11-07T10:30:12Z",
  "duration": 12,
  "result": {
    "success": true,
    "data": "..."
  },
  "trigger": "api"
}
```

**Guardar execution ID:**
```javascript
const response = pm.response.json();
pm.collectionVariables.set("execution_id", response.id);
```

---

## 🔟 **GET - Listar Executions**

**URL:** `{{base_url}}/executions`

**Method:** `GET`

**Headers:** (ninguno - usa cookie de JWT)

**Query Params (opcionales):**
- `limit=50` - Número máximo de resultados (default: 50, max: 200)
- `status=completed` - Filtrar por estado (pending|running|completed|failed|cancelled|timeout)
- `workflowId=uuid` - Filtrar por workflow específico

**Ejemplos de URLs:**
- `{{base_url}}/executions` - Todas las ejecuciones
- `{{base_url}}/executions?limit=10` - Solo 10 resultados
- `{{base_url}}/executions?status=failed` - Solo las que fallaron
- `{{base_url}}/executions?workflowId={{workflow_id}}` - De un workflow específico

**Respuesta esperada (200 OK):**
```json
{
  "total": 145,
  "executions": [
    {
      "id": "exec-uuid-1",
      "workflowId": "workflow-uuid",
      "status": "completed",
      "trigger": "api",
      "startedAt": "2025-11-08T10:30:00Z",
      "finishedAt": "2025-11-08T10:30:12Z",
      "duration": 12,
      "workflow": {
        "id": "workflow-uuid",
        "name": "Mi Workflow",
        "clientId": "client-uuid"
      }
    },
    {
      "id": "exec-uuid-2",
      "workflowId": "workflow-uuid",
      "status": "failed",
      "trigger": "webhook",
      "startedAt": "2025-11-08T09:15:00Z",
      "finishedAt": "2025-11-08T09:15:45Z",
      "duration": 45,
      "workflow": {
        "id": "workflow-uuid",
        "name": "Mi Workflow",
        "clientId": "client-uuid"
      }
    }
  ]
}
```

---

## 1️⃣1️⃣ **GET - Ver Execution específica**

**URL:** `{{base_url}}/executions/{{execution_id}}`

**Method:** `GET`

**Headers:** (ninguno)

**Respuesta esperada (200 OK):**
```json
{
  "id": "exec-uuid",
  "workflowId": "workflow-uuid",
  "status": "completed",
  "trigger": "api",
  "triggerData": {
    "ip": "192.168.1.1",
    "metadata": {
      "source": "postman",
      "campaign": "test-2025"
    }
  },
  "startedAt": "2025-11-08T10:30:00Z",
  "finishedAt": "2025-11-08T10:30:12Z",
  "duration": 12,
  "result": {
    "success": true,
    "data": {
      "message": "Lead procesado correctamente",
      "leadId": "12345"
    }
  },
  "error": null,
  "errorStack": null,
  "logs": "Step 1: Validando datos...\nStep 2: Guardando en CRM...\nStep 3: Enviando email...\nCompleted successfully!",
  "stepResults": [
    {
      "step": "validate",
      "status": "success",
      "duration": 2
    },
    {
      "step": "save_to_crm",
      "status": "success",
      "duration": 5
    },
    {
      "step": "send_email",
      "status": "success",
      "duration": 5
    }
  ],
  "retryCount": 0,
  "cost": 0.05,
  "credits": 1,
  "workflow": {
    "id": "workflow-uuid",
    "name": "Mi Workflow",
    "clientId": "client-uuid"
  },
  "createdAt": "2025-11-08T10:30:00Z",
  "updatedAt": "2025-11-08T10:30:12Z"
}
```

---

## 1️⃣2️⃣ **GET - Estadísticas de Executions**

**URL:** `{{base_url}}/executions/stats`

**Method:** `GET`

**Headers:** (ninguno)

**Query Params (opcionales):**
- `period=7d` - Periodo de tiempo: `24h`, `7d`, `30d`, `90d`, `all` (default: 7d)

**Ejemplos de URLs:**
- `{{base_url}}/executions/stats` - Últimos 7 días
- `{{base_url}}/executions/stats?period=24h` - Últimas 24 horas
- `{{base_url}}/executions/stats?period=30d` - Últimos 30 días

**Respuesta esperada (200 OK):**
```json
{
  "period": "7d",
  "total": 1450,
  "successful": 1380,
  "failed": 60,
  "cancelled": 10,
  "timeout": 0,
  "successRate": 95.17,
  "avgDuration": 8.5,
  "totalDuration": 12325,
  "byStatus": {
    "completed": 1380,
    "failed": 60,
    "cancelled": 10,
    "timeout": 0,
    "pending": 0,
    "running": 0
  },
  "byTrigger": {
    "api": 1200,
    "webhook": 150,
    "schedule": 100,
    "manual": 0
  },
  "topWorkflows": [
    {
      "workflowId": "uuid-1",
      "workflowName": "Lead Processing",
      "executions": 850,
      "successRate": 98.2
    },
    {
      "workflowId": "uuid-2",
      "workflowName": "Email Campaign",
      "executions": 400,
      "successRate": 92.5
    },
    {
      "workflowId": "uuid-3",
      "workflowName": "Data Sync",
      "executions": 200,
      "successRate": 99.0
    }
  ]
}
```

---

## 1️⃣3️⃣ **POST - Cancelar Execution**

**URL:** `{{base_url}}/executions/{{execution_id}}/cancel`

**Method:** `POST`

**Headers:** (ninguno)

**Body:** (ninguno)

**Respuesta esperada (200 OK):**
```json
{
  "success": true,
  "message": "Ejecución cancelada exitosamente",
  "execution": {
    "id": "exec-uuid",
    "status": "cancelled",
    "finishedAt": "2025-11-08T10:35:00Z",
    "duration": 300
  }
}
```

**Errores posibles:**
- `400 Bad Request` - La ejecución no está en estado `pending` o `running`
  ```json
  {
    "statusCode": 400,
    "message": "No se puede cancelar una ejecución con estado: completed"
  }
  ```

---

## 1️⃣4️⃣ **PUT - Actualizar Workflow**

**URL:** `{{base_url}}/workflows/{{workflow_id}}`

**Method:** `PUT`

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "name": "Mi Workflow Actualizado",
  "description": "Descripción actualizada",
  "isActive": true,
  "isPaused": false
}
```

**Respuesta esperada (200 OK):**
```json
{
  "id": "uuid",
  "name": "Mi Workflow Actualizado",
  "description": "Descripción actualizada",
  "version": 2,  // ← Se incrementa
  "updatedAt": "2025-11-07T..."
}
```

---

## 1️⃣5️⃣ **PATCH - Actualizar API Key**

**URL:** `{{base_url}}/api-keys/{{api_key_id}}`

**Method:** `PATCH`

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "name": "Production API Key v2",
  "isActive": true
}
```

**Respuesta esperada (200 OK):**
```json
{
  "success": true,
  "apiKey": {
    "id": "uuid",
    "name": "Production API Key v2",
    "keyPrefix": "ak_live_ab",
    "isActive": true,
    "updatedAt": "2025-11-07T..."
  },
  "message": "API Key actualizada exitosamente"
}
```

---

## 1️⃣7️⃣ **POST - Admin: Crear Usuario** (Requiere JWT + Admin Key)

**URL:** `{{base_url}}/admin/users`

**Method:** `POST`

**Headers:**
```
Content-Type: application/json
X-Admin-Key: {{admin_key}}
```

**Body (raw JSON):**
```json
{
  "name": "Usuario Normal",
  "email": "usuario@example.com",
  "password": "Password123!",
  "plan": "free"
}
```

**Respuesta esperada (201 Created):**
```json
{
  "id": "uuid-del-nuevo-usuario",
  "name": "Usuario Normal",
  "email": "usuario@example.com",
  "plan": "free",
  "isActive": true,
  "createdAt": "2025-11-07T..."
}
```

**Guardar ID del nuevo usuario:**
```javascript
const response = pm.response.json();
pm.collectionVariables.set("new_user_id", response.id);
```

---

## 1️⃣8️⃣ **GET - Admin: Listar Usuarios**

**URL:** `{{base_url}}/admin/users`

**Method:** `GET`

**Headers:**
```
X-Admin-Key: {{admin_key}}
```

**Query Params (opcionales):**
- `includeDeleted=true` - Incluir usuarios eliminados (default: false)
- `status=active` - Filtrar por estado: `active` | `inactive` | `all` (default: all)

**Ejemplos de URLs:**
- `{{base_url}}/admin/users` - Todos los usuarios no eliminados
- `{{base_url}}/admin/users?status=active` - Solo usuarios activos
- `{{base_url}}/admin/users?status=inactive` - Solo usuarios inactivos
- `{{base_url}}/admin/users?includeDeleted=true` - Incluir eliminados
- `{{base_url}}/admin/users?includeDeleted=true&status=active` - Activos + eliminados

**Respuesta esperada (200 OK):**
```json
[
  {
    "id": "uuid-1",
    "name": "Super Admin",
    "email": "admin@example.com",
    "emailVerified": false,
    "plan": "admin",
    "maxWorkflows": 999999,
    "maxExecutionsPerDay": 999999,
    "maxApiKeys": 999,
    "isActive": true,
    "createdAt": "2025-11-07T...",
    "updatedAt": "2025-11-08T...",
    "deletedAt": null,
    "lastLoginAt": "2025-11-08T...",
    "region": "us-central",
    "_count": {
      "workflows": 5,
      "apiKeys": 3
    }
  },
  {
    "id": "uuid-2",
    "name": "Usuario Normal",
    "email": "usuario@example.com",
    "emailVerified": false,
    "plan": "free",
    "maxWorkflows": 10,
    "maxExecutionsPerDay": 100,
    "maxApiKeys": 3,
    "isActive": true,
    "createdAt": "2025-11-08T...",
    "updatedAt": "2025-11-08T...",
    "deletedAt": null,
    "lastLoginAt": null,
    "region": "us-central",
    "_count": {
      "workflows": 0,
      "apiKeys": 0
    }
  }
]
```

---

## 1️⃣9️⃣ **GET - Admin: Ver Usuario Específico**

**URL:** `{{base_url}}/admin/users/{{new_user_id}}`

**Method:** `GET`

**Headers:**
```
X-Admin-Key: {{admin_key}}
```

**Respuesta esperada (200 OK):**
```json
{
  "id": "uuid",
  "name": "Usuario Normal",
  "email": "usuario@example.com",
  "emailVerified": false,
  "plan": "free",
  "maxWorkflows": 10,
  "maxExecutionsPerDay": 100,
  "maxApiKeys": 3,
  "isActive": true,
  "createdAt": "2025-11-08T...",
  "updatedAt": "2025-11-08T...",
  "deletedAt": null,
  "lastLoginAt": null,
  "region": "us-central",
  "metadata": null,
  "_count": {
    "workflows": 0,
    "apiKeys": 0,
    "refreshTokens": 0
  }
}
```

**Errores:**
- `404 Not Found` - Usuario no encontrado

---

## 2️⃣0️⃣ **PATCH - Admin: Actualizar Usuario**

**URL:** `{{base_url}}/admin/users/{{new_user_id}}`

**Method:** `PATCH`

**Headers:**
```
Content-Type: application/json
X-Admin-Key: {{admin_key}}
```

**Body (todos los campos opcionales):**
```json
{
  "name": "Usuario Premium",
  "plan": "pro",
  "maxWorkflows": 50,
  "maxExecutionsPerDay": 10000,
  "maxApiKeys": 10,
  "isActive": true,
  "region": "us-east"
}
```

**Respuesta esperada (200 OK):**
```json
{
  "id": "uuid",
  "name": "Usuario Premium",
  "email": "usuario@example.com",
  "plan": "pro",
  "maxWorkflows": 50,
  "maxExecutionsPerDay": 10000,
  "maxApiKeys": 10,
  "isActive": true,
  "region": "us-east",
  "updatedAt": "2025-11-08T..."
}
```

**Casos de uso:**
- Cambiar plan de usuario
- Ajustar límites personalizados
- Cambiar región
- Activar/desactivar usuario sin eliminarlo
- Actualizar nombre o email

**Errores:**
- `404 Not Found` - Usuario no encontrado
- `409 Conflict` - Email ya está en uso por otro usuario

---

## 2️⃣1️⃣ **PATCH - Admin: Cambiar Contraseña de Usuario**

**URL:** `{{base_url}}/admin/users/{{new_user_id}}/password`

**Method:** `PATCH`

**Headers:**
```
Content-Type: application/json
X-Admin-Key: {{admin_key}}
```

**Body:**
```json
{
  "newPassword": "NuevaPassword123!"
}
```

**Respuesta esperada (200 OK):**
```json
{
  "message": "Contraseña actualizada exitosamente. Todas las sesiones han sido cerradas."
}
```

**⚠️ IMPORTANTE:**
- Invalida TODAS las sesiones activas del usuario
- El usuario tendrá que hacer login de nuevo
- Útil para recuperación de cuentas o seguridad

**Errores:**
- `404 Not Found` - Usuario no encontrado
- `400 Bad Request` - Contraseña muy corta (mínimo 8 caracteres)

---

## 2️⃣2️⃣ **POST - Refresh Token**

**URL:** `{{base_url}}/auth/refresh`

**Method:** `POST`

**Headers:** (ninguno)

**Body:** (ninguno - lee el refreshToken de la cookie)

**Respuesta esperada (200 OK):**
```json
{
  "success": true
}
```

**Verificar:**
- Las cookies se actualizaron con nuevos tokens
- Ve a **Cookies** → deberías ver nuevos valores

---

## 2️⃣3️⃣ **POST - Logout**

**URL:** `{{base_url}}/auth/logout`

**Method:** `POST`

**Headers:** (ninguno)

**Body:** (ninguno)

**Respuesta esperada (200 OK):**
```json
{
  "message": "Sesión cerrada exitosamente"
}
```

**Verificar:**
- Las cookies se limpiaron
- Si intentas `/auth/me` ahora, recibirás 401

---

## 2️⃣4️⃣ **POST - Login de nuevo** (Para probar logout-all)

Repite el **Paso 1** (Login) para volver a tener sesión activa.

---

## 2️⃣5️⃣ **POST - Logout All** (Cerrar todas las sesiones)

**URL:** `{{base_url}}/auth/logout-all`

**Method:** `POST`

**Headers:** (ninguno)

**Body:** (ninguno)

**Respuesta esperada (200 OK):**
```json
{
  "message": "Sesión cerrada en todos los dispositivos"
}
```

---

## 2️⃣6️⃣ **POST - Admin: Reactivar Usuario**

**Primero haz login de nuevo (Paso 1)**

Este endpoint reactiva un usuario que fue eliminado (soft delete).

**URL:** `{{base_url}}/admin/users/{{new_user_id}}/activate`

**Method:** `POST`

**Headers:**
```
X-Admin-Key: {{admin_key}}
```

**Body:** (ninguno)

**Respuesta esperada (200 OK):**
```json
{
  "id": "uuid",
  "name": "Usuario Normal",
  "email": "usuario@example.com",
  "isActive": true,
  "deletedAt": null,
  "updatedAt": "2025-11-08T..."
}
```

**Errores:**
- `404 Not Found` - Usuario no encontrado
- `409 Conflict` - Usuario no está eliminado

---

## 2️⃣7️⃣ **DELETE - Admin: Eliminar Usuario**

**URL:** `{{base_url}}/admin/users/{{new_user_id}}`

**Method:** `DELETE`

**Headers:**
```
X-Admin-Key: {{admin_key}}
```

**Respuesta esperada (200 OK):**
```json
{
  "id": "uuid",
  "name": "Usuario Normal",
  "email": "usuario@example.com",
  "deletedAt": "2025-11-08T..."
}
```

**⚠️ IMPORTANTE:**
- Es un soft delete (marca `deletedAt`, no borra físicamente)
- Invalida todos los refresh tokens del usuario
- El usuario puede ser reactivado con `/admin/users/:id/activate`

**Errores:**
- `404 Not Found` - Usuario no encontrado
- `409 Conflict` - Usuario ya está eliminado

---

## 2️⃣8️⃣ **DELETE - Eliminar API Key**

**URL:** `{{base_url}}/api-keys/{{api_key_id}}`

**Method:** `DELETE`

**Headers:** (ninguno)

**Respuesta esperada (200 OK):**
```json
{
  "success": true,
  "message": "API Key eliminada exitosamente"
}
```

---

## 2️⃣9️⃣ **DELETE - Eliminar Workflow**

**URL:** `{{base_url}}/workflows/{{workflow_id}}`

**Method:** `DELETE`

**Headers:** (ninguno)

**Respuesta esperada (200 OK):**
```json
{
  "message": "Workflow eliminado exitosamente",
  "workflow": {
    "id": "uuid",
    "deletedAt": "2025-11-07T..."
  }
}
```

---

## CHECKLIST DE PRUEBAS

```
[ ] 0. Crear Super Admin (Terminal)
[ ] 1. Login (obtener cookies)
[ ] 2. Auth/Me (verificar sesión)
[ ] 3. Crear API Key (guardar apiKey)
[ ] 4. Listar API Keys
[ ] 5. Ver API Key específica
[ ] 6. Crear Workflow (guardar workflow_id)
[ ] 7. Listar Workflows
[ ] 8. Ver Workflow específico
[ ] 9. Ejecutar Workflow (con X-API-Key, guardar execution_id)
[ ] 10. Listar Executions
[ ] 11. Ver Execution específica
[ ] 12. Estadísticas de Executions
[ ] 13. Cancelar Execution (opcional)
[ ] 14. Actualizar Workflow
[ ] 15. Actualizar API Key
[ ] 16. Toggle API Key
[ ] 17. Admin: Crear Usuario (guardar new_user_id)
[ ] 18. Admin: Listar Usuarios (probar filtros)
[ ] 19. Admin: Ver Usuario específico
[ ] 20. Admin: Actualizar Usuario
[ ] 21. Admin: Cambiar contraseña de usuario
[ ] 22. Refresh Token
[ ] 23. Logout
[ ] 24. Login de nuevo
[ ] 25. Logout All
[ ] 26. Admin: Reactivar Usuario
[ ] 27. Admin: Eliminar Usuario
[ ] 28. Eliminar API Key
[ ] 29. Eliminar Workflow
```

---

## TROUBLESHOOTING

### Error 401 Unauthorized
- Verifica que las cookies estén habilitadas en Postman
- Verifica que hiciste login primero
- Revisa en **Cookies** que `accessToken` y `refreshToken` existan

### Error 403 Forbidden (en endpoints /admin)
- Verifica que el header `X-Admin-Key` esté correcto
- Verifica que estés logueado como usuario con plan `admin`

### Cookies no se guardan
- ✅ **IMPORTANTE:** Usa Postman Desktop (no la versión web del navegador)
- ✅ La versión web tiene limitaciones con cookies httpOnly
- ✅ Descarga: https://www.postman.com/downloads/
- ✅ Verifica en **Cookies** (link debajo de "Send") que aparezcan las cookies
- ✅ Asegúrate de usar la misma colección para todas las peticiones

### Error de CORS
- Verifica que el servidor esté corriendo en `http://localhost:3000`
- No debería haber error de CORS en Postman (solo en navegadores)

---

## VARIABLES DE COLECCIÓN

Al final, tu colección debería tener estas variables:

| Variable | Ejemplo de Valor |
|----------|------------------|
| `base_url` | `http://localhost:3000/api` |
| `admin_key` | `change-this-to-a-random-generated-key...` |
| `user_id` | `uuid-del-usuario` |
| `api_key` | `ak_live_abc123...` |
| `api_key_id` | `uuid-del-api-key` |
| `workflow_id` | `uuid-del-workflow` |
| `execution_id` | `uuid-de-la-ejecución` |
| `new_user_id` | `uuid-del-nuevo-usuario` |

---

## TIPS 

1. **Exportar colección**: File → Export → Postman Collection v2.1
2. **Crear tests automáticos**: Usa la pestaña **Tests** para validar responses
3. **Crear entorno**: Environments → Para dev/staging/prod
4. **Runner**: Collection Runner para ejecutar todos los tests en secuencia

---
