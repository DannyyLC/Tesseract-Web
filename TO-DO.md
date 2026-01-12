# DASHBOARD - Datos por Tabla

## 1. Organization (Su Organización)

- `name` - Nombre de la organización
- `plan` - Plan actual (FREE, STARTER, GROWTH, BUSINESS, PRO, ENTERPRISE)
- `allowOverages` - Si pueden seguir ejecutando con balance negativo
- `overageLimit` - Límite de créditos negativos permitido
- `isActive` - Estado de la organización
- `createdAt` - Fecha de creación

**Límites personalizados:**

- `customMaxUsers` - Cuántos usuarios pueden tener
- `customMaxApiKeys` - Cuántas API keys pueden crear
- `customMaxWorkflows` - Cuántos workflows pueden crear

---

## 2. CreditBalance (Balance de Créditos)

- `balance` - Balance actual de créditos
- `currentMonthSpent` - Créditos gastados este mes

---

## 3. Subscription (Suscripción Activa)

- `plan` - Plan actual (duplicado de Organization)
- `status` - Estado: ACTIVE, CANCELED, PAST_DUE, INCOMPLETE
- `currentPeriodStart` - Inicio del periodo actual
- `currentPeriodEnd` - Cuándo renueva
- `cancelAtPeriodEnd` - Si cancelarán al final del periodo
- `pendingPlanChange` - Plan al que cambiarán (si hay downgrade/upgrade programado)
- `planChangeRequestedAt` - Cuándo solicitaron el cambio

**Para planes ENTERPRISE:**

- `customMonthlyPrice` - Precio mensual personalizado
- `customMonthlyCredits` - Créditos mensuales personalizados
- `customMaxWorkflows` - Límite de workflows personalizado
- `customFeatures` - Features especiales (SLA, soporte 24/7, etc)

---

## 4. CreditTransaction (Historial de Transacciones)

- `type` - Tipo de transacción (SUBSCRIPTION_RENEWAL, EXECUTION_DEDUCTION, etc)
- `amount` - Monto (+ ingreso, - gasto)
- `balanceBefore` - Balance antes
- `balanceAfter` - Balance después
- `workflowCategory` - Si fue ejecución: LIGHT/STANDARD/ADVANCED
- `costUSD` - Costo real en USD solo cuando se trata del pago de una suscripcion no de lo que le costo la ejecucion. Si el registro corresponde a la ejecucion de un workflow no enviar el campo de costUSD
- `description` - Descripción legible
- `createdAt` - Fecha de la transacción

**Referencias:**

- `executionId` - Si fue por ejecución de workflow
- `invoiceId` - Si fue por compra/pago

---

## 5. Invoice (Facturas)

- `invoiceNumber` - Número de factura (INV-202601-0001)
- `type` - SUBSCRIPTION, OVERAGE, ONE_TIME
- `status` - DRAFT, PENDING, PAID, FAILED, REFUNDED
- `periodStart` / `periodEnd` - Periodo facturado
- `subtotal` - Precio base
- `overageAmount` - Cargos por overages
- `tax` - Impuestos
- `total` - Total a pagar
- `stripeHostedUrl` - URL para pagar
- `stripePdfUrl` - PDF de la factura
- `paidAt` - Cuándo se pagó
- `dueAt` - Fecha límite de pago

---

## 6. User (Usuarios de la Organización)

- `email` - Email del usuario
- `name` - Nombre completo
- `role` - Rol: viewer, editor, admin, owner
- `isActive` - Si está activo
- `emailVerified` - Si verificó su email
- `twoFactorEnabled` - Si tiene 2FA activado
- `lastLoginAt` - Último login
- `createdAt` - Cuándo se creó la cuenta
- `avatar` - URL del avatar
- `timezone` - Zona horaria

---

## 7. Workflow (Agentes/Workflows)

- `name` - Nombre del workflow
- `description` - Descripción
- `category` - LIGHT (1cr), STANDARD (5cr), ADVANCED (25cr)
- `isActive` - Si está activo
- `isPaused` - Si está pausado
- `version` - Versión actual
- `triggerType` - Cómo se ejecuta: api, schedule, webhook, whatsapp
- `schedule` - Expresión cron (si es programado)

**Límites:**

- `maxTokensPerExecution` - Tokens máximos por ejecución

**Estadísticas:**

- `totalExecutions` - Total de ejecuciones
- `successfulExecutions` - Ejecuciones exitosas
- `failedExecutions` - Ejecuciones fallidas
- `totalCreditsConsumed` - Créditos totales consumidos
- `avgCreditsPerExecution` - Promedio de créditos por ejecución. Por ahora este siempre sera segun la categoria ya que siempre cuesta lo mismo
- `lastExecutedAt` - Última ejecución
- `avgExecutionTime` - Tiempo promedio de ejecución

---

## 8. Execution (Ejecuciones de Workflows)

- `status` - pending, running, completed, failed, cancelled, timeout
- `startedAt` - Cuándo empezó
- `finishedAt` - Cuándo terminó
- `duration` - Duración en segundos
- `trigger` - Cómo se activó: manual, api, schedule, webhook, whatsapp

**Costos:**

- `credits` - Créditos cobrados (1/5/25)
- `cost` - Costo real en USD. Este nunca se le envia al usuario
- `tokensUsed` - Tokens consumidos. Este nunca se le envia al usuario
- `balanceBefore` / `balanceAfter` - Snapshot del balance
- `wasOverage` - Si se ejecutó con balance negativo
- `error` - Mensaje de error (si falló)
- `retryCount` - Número de reintentos

**Relaciones:**

- `workflowId` - Qué workflow se ejecutó
- `userId` - Quién lo ejecutó (si fue manual)
- `conversationId` - Conversación asociada (si aplica)

---

## 9. Conversation (Conversaciones)

- `title` - Título de la conversación
- `channel` - dashboard, whatsapp, web, api
- `status` - active, inactive, closed
- `messageCount` - Número de mensajes
- `totalTokens` - Tokens totales usados. Nunca se le envia a un usuario
- `totalCost` - Costo acumulado en USD. Nunca se le envia a un usuario
- `lastMessageAt` - Último mensaje enviado
- `createdAt` - Cuándo se creó
- `closedAt` - Cuándo se cerró

**Relaciones:**

- `workflowId` - Workflow asociado
- `userId` - User interno (si aplica)
- `endUserId` - Cliente externo (si aplica)

---

## 10. Message (Mensajes de Conversaciones)

- `role` - user, assistant, system, tool
- `content` - Contenido del mensaje
- `attachments` - Archivos adjuntos (imágenes, videos, etc)
- `model` - Modelo de IA usado (si es respuesta del asistente)
- `tokens` - Tokens consumidos. Nunca se envia al usuario
- `cost` - Costo en USD. Nunca se envia al usuario
- `latencyMs` - Latencia en milisegundos. Nunca se le envia al usuario
- `toolCalls` - Llamadas a herramientas realizadas. Por ahora aun no se usa
- `toolResults` - Resultados de las herramientas. Por ahora aun no se usa
- `feedback` - Feedback del usuario (positive, negative, neutral). No se usa
- `feedbackComment` - Comentario del feedback. No se usa
- `createdAt` - Timestamp

---

## 11. EndUser (Clientes Externos)

- `phoneNumber` - Número de telefono
- `email` - Email
- `externalId` - ID del sistema del cliente (HubSpot, etc)
- `name` - Nombre
- `avatar` - Avatar
- `metadata` - Datos adicionales
- `lastSeenAt` - Última vez visto
- `createdAt` - Cuándo se creó

---

## 12. TenantTool (Conexiones con Tools)

- `displayName` - Nombre personalizado ("Google Calendar - Ventas")
- `isConnected` - Si está conectada
- `connectionError` - Error de conexión (si hay)
- `connectedAt` - Cuándo se conectó
- `lastUsedAt` - Último uso
- `oauthProvider` - Proveedor OAuth
- `tokenExpiresAt` - Cuándo expira el token

**Relación:**

- `toolCatalogId` - Qué tool es (google_calendar, hubspot, etc)

---

## 14. ApiKey (API Keys)

- `name` - Nombre de la key
- `description` - Descripción
- `keyPrefix` - Primeros caracteres (para identificar)
- `isActive` - Si está activa
- `lastUsedAt` - Último uso
- `expiresAt` - Cuándo expira
- `scopes` - Permisos (workflows:read, workflows:execute, etc). No funciona por ahora
- `createdAt` - Cuándo se creó

---

## 15. WhatsAppConfig (Configuraciones de WhatsApp)

> ⚠️ **Nada de whatsapp funciona aun**

- `phoneNumber` - Número de teléfono
- `displayName` - Nombre para mostrar
- `provider` - baileys, twilio, meta
- `connectionStatus` - Estado de conexión
- `lastConnectedAt` - Última conexión
- `connectionError` - Error de conexión
- `isActive` - Si está activo
- `qrCode` - QR para conectar (baileys)
- `qrCodeExpiry` - Expiración del QR

**Relación:**

- `defaultWorkflowId` - Workflow por defecto para mensajes

---

## 16. AuditLog (Logs de Auditoría)

> ⚠️ **No se usa aun**

- `userEmail` / `userName` - Quién hizo la acción
- `action` - Qué hizo (create, update, delete, login, etc)
- `resource` - Recurso afectado (organization, user, workflow)
- `resourceId` - ID del recurso
- `method` - GET, POST, PUT, DELETE
- `endpoint` - Endpoint llamado
- `changes` - Cambios realizados (before/after)
- `ipAddress` - IP de origen
- `statusCode` - Código de respuesta
- `success` - Si fue exitoso
- `errorMessage` - Mensaje de error (si falló)
- `timestamp` - Cuándo ocurrió

## Email

En users.service.ts falta poner la implementacion del envio de emails. para esto se crea un servicio dedicado y se usa el metodo aqui

## Users

Para el servicio de los usuarios tambien falta implementar los guards que se encargues que que se cumplan lo roles y aplicar la segurida necesaria de acceso
