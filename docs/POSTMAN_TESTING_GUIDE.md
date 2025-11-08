# Guía de Testing con Postman - Todos los Endpoints

Esta guía te llevará paso a paso para probar **TODOS** los endpoints del Gateway en orden lógico.

**Base URL:** `http://localhost:3000/api`

---

## ⚙️ CONFIGURACIÓN INICIAL DE POSTMAN

### 1. Habilitar cookies en Postman
**En Postman v10+, las cookies están habilitadas por defecto**, pero necesitas:

1. **NO uses Postman Web** - Descarga la app de escritorio (las cookies httpOnly no funcionan en la versión web)
2. Ve a **Settings** (⚙️ arriba a la derecha) → **Cookies**
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
10. Ejecutar Workflow (con API Key)
11. Actualizar Workflow
12. Actualizar API Key
13. Toggle API Key
14. Admin - Crear Usuario
15. Admin - Listar Usuarios
16. Refresh Token
17. Logout
18. Login de nuevo
19. Logout All
20. Admin - Eliminar Usuario
21. Eliminar API Key
22. Eliminar Workflow
```

---

## PASO A PASO - ENDPOINTS

### PASO 0: Crear Super Admin (Terminal)

**Antes de empezar**, necesitas crear un usuario admin desde la terminal:

```bash
cd /home/dannylimon/Ixeh/WorkflowAutomation/apps/gateway
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

---

## 🔟 **PUT - Actualizar Workflow**

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

## 1️⃣1️⃣ **PATCH - Actualizar API Key**

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

## 1️⃣2️⃣ **POST - Toggle API Key** (Activar/Desactivar)

**URL:** `{{base_url}}/api-keys/{{api_key_id}}/toggle`

**Method:** `POST`

**Headers:** (ninguno)

**Body:** (ninguno)

**Respuesta esperada (200 OK):**
```json
{
  "success": true,
  "isActive": false,
  "message": "API Key desactivada exitosamente"
}
```

---

## 1️⃣3️⃣ **POST - Admin: Crear Usuario** (Requiere JWT + Admin Key)

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

## 1️⃣4️⃣ **GET - Admin: Listar Usuarios**

**URL:** `{{base_url}}/admin/users`

**Method:** `GET`

**Headers:**
```
X-Admin-Key: {{admin_key}}
```

**Respuesta esperada (200 OK):**
```json
{
  "message": "Listado de usuarios - Por implementar"
}
```

*Nota: Este endpoint aún no está implementado completamente*

---

## 1️⃣5️⃣ **POST - Refresh Token**

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

## 1️⃣6️⃣ **POST - Logout**

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

## 1️⃣7️⃣ **POST - Login de nuevo** (Para probar logout-all)

Repite el **Paso 1** (Login) para volver a tener sesión activa.

---

## 1️⃣8️⃣ **POST - Logout All** (Cerrar todas las sesiones)

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

## 1️⃣9️⃣ **DELETE - Admin: Eliminar Usuario**

**Primero haz login de nuevo (Paso 1)**

**URL:** `{{base_url}}/admin/users/{{new_user_id}}`

**Method:** `DELETE`

**Headers:**
```
X-Admin-Key: {{admin_key}}
```

**Respuesta esperada (200 OK):**
```json
{
  "message": "Usuario uuid eliminado - Por implementar"
}
```

*Nota: Este endpoint aún no está implementado completamente*

---

## 2️⃣0️⃣ **DELETE - Eliminar API Key**

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

## 2️⃣1️⃣ **DELETE - Eliminar Workflow**

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
[ ] 9. Ejecutar Workflow (con X-API-Key)
[ ] 10. Actualizar Workflow
[ ] 11. Actualizar API Key
[ ] 12. Toggle API Key
[ ] 13. Admin: Crear Usuario
[ ] 14. Admin: Listar Usuarios
[ ] 15. Refresh Token
[ ] 16. Logout
[ ] 17. Login de nuevo
[ ] 18. Logout All
[ ] 19. Admin: Eliminar Usuario
[ ] 20. Eliminar API Key
[ ] 21. Eliminar Workflow
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
| `new_user_id` | `uuid-del-nuevo-usuario` |

---

## TIPS 

1. **Exportar colección**: File → Export → Postman Collection v2.1
2. **Crear tests automáticos**: Usa la pestaña **Tests** para validar responses
3. **Crear entorno**: Environments → Para dev/staging/prod
4. **Runner**: Collection Runner para ejecutar todos los tests en secuencia

---
