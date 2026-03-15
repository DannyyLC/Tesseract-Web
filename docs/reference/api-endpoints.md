---
title: 'Referencia de API'
description: 'Listado completo de todos los endpoints REST y SSE del Gateway de Tesseract.'
---

Base URL: `https://api.tesseract.app` (produccion) / `http://localhost:3000` (local)

Todos los endpoints (salvo auth publicos y webhooks) requieren autenticacion. La API soporta dos metodos:

| Metodo | Header | Usado por |
|---|---|---|
| JWT (Bearer Token) | `Authorization: Bearer <token>` | Web-Client (usuarios internos) |
| API Key | `X-API-Key: ak_live_xxx...` | Integraciones externas |

Formato de respuesta estandar:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Description",
  "data": { ... },
  "errors": []
}
```

---

## Auth

Base path: `/auth`

| Metodo | Endpoint | Descripcion | Auth |
|---|---|---|---|
| GET | `/auth/google` | Inicia flujo OAuth con Google | No |
| GET | `/auth/google/callback` | Callback de Google OAuth | No |
| POST | `/auth/login` | Login con email y password | No |
| POST | `/auth/signup/step-1` | Registro paso 1: enviar codigo de verificacion | No |
| POST | `/auth/signup/step-2` | Registro paso 2: verificar codigo | No |
| POST | `/auth/signup/step-3` | Registro paso 3: crear usuario y organizacion | No |
| POST | `/auth/refresh` | Renovar access token con refresh token | Cookie |
| GET | `/auth/profile` | Obtener perfil del usuario autenticado | JWT |
| POST | `/auth/logout` | Cerrar sesion actual | JWT |
| POST | `/auth/logout-all` | Cerrar todas las sesiones | JWT |
| POST | `/auth/2fa/setup` | Generar QR para configurar 2FA | JWT |
| POST | `/auth/2fa/enable` | Activar 2FA con codigo de verificacion | JWT |
| POST | `/auth/2fa/verify` | Verificar codigo 2FA durante login | TempToken |
| POST | `/auth/2fa/disable` | Desactivar 2FA | JWT |
| POST | `/auth/forgot-password/step-1` | Enviar email de recuperacion | No |
| POST | `/auth/forgot-password/step-2` | Resetear password con codigo | No |
| POST | `/auth/change-password` | Cambiar password (autenticado) | JWT |

---

## Users

Base path: `/users` — Requiere JWT

| Metodo | Endpoint | Descripcion | Roles |
|---|---|---|---|
| GET | `/users/dashboard` | Listar usuarios (paginado) | owner, admin, viewer |
| GET | `/users/notifications` | Listar notificaciones (paginado) | Todos |
| GET | `/users/notifications/unread-count` | Contador de no leidas | Todos |
| GET | `/users/stats` | Estadisticas del dashboard | Todos |
| GET | `/users/:id` | Detalle de un usuario | owner, admin |
| PATCH | `/users/:id` | Actualizar usuario (rol, estado) | owner, admin |
| PATCH | `/users/:id/profile` | Actualizar perfil propio | Todos |
| POST | `/users/:id/transfer-ownership` | Transferir ownership | owner |
| DELETE | `/users/:id` | Eliminar usuario | owner, admin |
| POST | `/users/leave-organization` | Abandonar la organizacion | Todos |
| PATCH | `/users/notifications/:id/read` | Marcar notificacion como leida | Todos |
| POST | `/users/notifications/read-all` | Marcar todas como leidas | Todos |
| DELETE | `/users/notifications/:id` | Eliminar notificacion | Todos |
| POST | `/users/request-service-info` | Solicitar info de servicio por email | Todos |

---

## Organizations

Base path: `/organizations` — Requiere JWT

| Metodo | Endpoint | Descripcion | Roles |
|---|---|---|---|
| GET | `/organizations/dashboard` | Datos del dashboard de la org | owner, admin, viewer |
| PATCH | `/organizations/update` | Actualizar nombre/slug | owner |
| DELETE | `/organizations/delete` | Eliminar organizacion (con 2FA) | owner |
| POST | `/organizations/invite-user` | Invitar usuario por email | owner, admin |
| POST | `/organizations/resend-invitation` | Reenviar invitacion | owner, admin |
| POST | `/organizations/cancel-invitation` | Cancelar invitacion pendiente | owner, admin |
| POST | `/organizations/accept-invitation` | Aceptar invitacion (crear cuenta) | No auth |

---

## Workflows

Base path: `/workflows` — Requiere JWT

| Metodo | Endpoint | Descripcion | Roles |
|---|---|---|---|
| GET | `/workflows/dashboard` | Listar workflows (paginado, filtrable) | owner, admin, viewer |
| GET | `/workflows/stats` | Estadisticas globales de workflows | owner, admin, viewer |
| GET | `/workflows/:id` | Detalle de un workflow | owner, admin, viewer |
| PUT | `/workflows/:id` | Actualizar workflow | owner, admin |
| DELETE | `/workflows/:id` | Eliminar workflow (soft delete) | owner, admin |
| POST | `/workflows/:id/execute` | Ejecutar workflow (respuesta completa) | owner, admin, viewer |
| POST | `/workflows/:id/execute/stream` | Ejecutar workflow (SSE streaming) | owner, admin, viewer |
| GET | `/workflows/:id/metrics` | Metricas detalladas de un workflow | owner, admin, viewer |

### API Externa (API Key)

Base path: `/v1/workflows` — Requiere `X-API-Key`

| Metodo | Endpoint | Descripcion |
|---|---|---|
| POST | `/v1/workflows/:id/execute` | Ejecutar workflow via API Key |
| POST | `/v1/workflows/:id/execute/stream` | Ejecutar workflow en streaming via API Key |

> Nota: Si `:id` es `current`, se usa el workflow asociado al API Key.

---

## Conversations

Base path: `/conversations` — Requiere JWT

| Metodo | Endpoint | Descripcion | Roles |
|---|---|---|---|
| GET | `/conversations/dashboard` | Listar conversaciones (paginado) | owner, admin, viewer |
| GET | `/conversations/stats` | Estadisticas de conversaciones | owner, admin, viewer |
| GET | `/conversations/:id` | Detalle con mensajes | owner, admin, viewer |
| PATCH | `/conversations/:id` | Actualizar conversacion | owner, admin, viewer |
| DELETE | `/conversations/:id` | Eliminar conversacion | owner, admin |

---

## Executions

Base path: `/executions` — Requiere JWT

| Metodo | Endpoint | Descripcion | Roles |
|---|---|---|---|
| GET | `/executions/dashboard` | Historial de ejecuciones (paginado, filtrable) | owner, admin, viewer |
| GET | `/executions/stats` | Estadisticas de ejecuciones | owner, admin, viewer |
| GET | `/executions/:id` | Detalle de una ejecucion | owner, admin, viewer |
| POST | `/executions/:id/cancel` | Cancelar ejecucion en progreso | owner, admin |
| DELETE | `/executions/:id` | Eliminar ejecucion (soft delete) | owner, admin |

---

## Billing

Base path: `/billing` — Requiere JWT (salvo webhook)

| Metodo | Endpoint | Descripcion | Roles |
|---|---|---|---|
| POST | `/billing/create-checkout-session` | Crear sesion de Stripe Checkout | owner, admin |
| POST | `/billing/create-portal-session` | Crear sesion de Stripe Portal | owner, admin |
| GET | `/billing/plans` | Obtener planes disponibles | Todos |
| GET | `/billing/subscription` | Suscripcion activa de la org | Todos |
| PUT | `/billing/subscription` | Cambiar de plan | owner, admin |
| GET | `/billing/dashboard` | Dashboard de billing (creditos, uso) | Todos |
| DELETE | `/billing/subscription` | Cancelar suscripcion | owner, admin |
| POST | `/billing/subscription/resume` | Reanudar suscripcion cancelada | owner, admin |
| POST | `/billing/subscription/cancel-downgrade` | Cancelar downgrade pendiente | owner, admin |
| POST | `/billing/webhook` | Webhook de Stripe (eventos) | No auth (firma Stripe) |
| PATCH | `/billing/overages` | Activar/desactivar overage y su limite | owner, admin |

---

## API Keys

Base path: `/api-keys` — Requiere JWT

| Metodo | Endpoint | Descripcion | Roles |
|---|---|---|---|
| POST | `/api-keys` | Crear nueva API Key | owner, admin |
| GET | `/api-keys` | Listar API Keys de la org | owner, admin, viewer |
| GET | `/api-keys/:id` | Detalle de una API Key | owner, admin, viewer |
| DELETE | `/api-keys/:id` | Eliminar API Key (soft delete) | owner, admin |
| PATCH | `/api-keys/:id` | Actualizar nombre/estado | owner, admin |

---

## Invoices

Base path: `/invoice` — Requiere JWT

| Metodo | Endpoint | Descripcion | Roles |
|---|---|---|---|
| GET | `/invoice/dashboard` | Listar facturas (paginado) | owner, admin, viewer |

---

## Tools - Catalogo

Base path: `/tools-catalog` — Requiere JWT

| Metodo | Endpoint | Descripcion | Roles |
|---|---|---|---|
| GET | `/tools-catalog` | Listar herramientas del catalogo (paginado) | owner, admin, viewer |

---

## Tools - Tenant (Herramientas Conectadas)

Base path: `/tenant-tool` — Requiere JWT

| Metodo | Endpoint | Descripcion | Roles |
|---|---|---|---|
| GET | `/tenant-tool/dashboard` | Listar herramientas conectadas (paginado) | owner, admin, viewer |
| POST | `/tenant-tool/create` | Conectar nueva herramienta | owner, admin |
| PUT | `/tenant-tool/update/:id` | Actualizar herramienta | owner, admin |
| POST | `/tenant-tool/add-workflows/:id` | Asignar workflows a una herramienta | owner, admin |
| POST | `/tenant-tool/remove-workflows/:id` | Desasignar workflows | owner, admin |
| GET | `/tenant-tool/:id` | Detalle de herramienta conectada | owner, admin, viewer |
| DELETE | `/tenant-tool/disconnect/:toolId` | Desconectar (revocar OAuth) | owner, admin |
| DELETE | `/tenant-tool/:toolId` | Eliminar herramienta (soft delete + wipe secrets) | owner, admin |

---

## Tools - OAuth

Base path: `/tools/oauth` — Requiere JWT (salvo callback)

| Metodo | Endpoint | Descripcion | Auth |
|---|---|---|---|
| GET | `/tools/oauth/google/auth-url` | Generar URL de autorizacion Google | JWT |
| GET | `/tools/oauth/google/callback` | Callback de Google (intercambia code por tokens) | No (state firmado) |

---

## End Users

Base path: `/end-users` — Requiere JWT

| Metodo | Endpoint | Descripcion | Roles |
|---|---|---|---|
| GET | `/end-users/dashboard` | Listar usuarios externos (paginado) | owner, admin, viewer |

---

## Events (Server-Sent Events)

Base path: `/events` — Requiere JWT

Todos los endpoints de eventos usan **SSE** (Server-Sent Events). El cliente abre una conexion persistente y recibe actualizaciones en tiempo real, filtradas automaticamente por `organizationId`.

| Endpoint SSE | Datos que emite |
|---|---|
| `/events/organization/stream` | Cambios en la organizacion |
| `/events/workflow/stream` | CRUD de workflows |
| `/events/conversation/stream` | Nuevas conversaciones, mensajes |
| `/events/user/stream` | Cambios de usuarios |
| `/events/credit-balance/stream` | Movimientos de creditos |
| `/events/credit-transaction/stream` | Nuevas transacciones |
| `/events/end-user/stream` | Actividad de usuarios externos |
| `/events/execution/stream` | Ejecuciones iniciadas/completadas |
| `/events/api-key/stream` | CRUD de API Keys |
| `/events/invoice/stream` | Nuevas facturas |
| `/events/subscription/stream` | Cambios de suscripcion |
| `/events/app-notifications/stream` | Notificaciones in-app (filtradas por rol) |

---

## Paginacion

Todos los endpoints de listado usan **paginacion por cursor**. Parametros comunes:

| Query Param | Tipo | Default | Descripcion |
|---|---|---|---|
| `cursor` | string | null | ID del ultimo item de la pagina anterior |
| `pageSize` | number | 10 | Cantidad de items por pagina |
| `action` | "next" / "prev" | null | Direccion de la paginacion |
