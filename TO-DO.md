# DASHBOARD - Datos por Tabla

## 1. Organization (Su Organización)

- `[SEND]` `id`
- `[SEND]` `name` - Nombre de la organización
- `[SEND]` `plan` - Plan actual (FREE, STARTER, GROWTH, BUSINESS, PRO, ENTERPRISE)
- `[SEND]` `allowOverages` - Si pueden seguir ejecutando con balance negativo
- `[SEND]` `overageLimit` - Límite de créditos negativos permitido
- `[SEND]` `isActive` - Estado de la organización
- `[SEND]` `createdAt` - Fecha de creación

**Límites personalizados:**

- `[SEND]` `customMaxUsers`
- `[SEND]` `customMaxApiKeys`
- `[SEND]` `customMaxWorkflows`

---

## 2. CreditBalance (Balance de Créditos)

- `[SEND]` `balance` - Balance actual de créditos
- `[SEND]` `currentMonthSpent` - Créditos gastados este mes

---

## 3. Subscription (Suscripción Activa)

_Nota: Enviar dentro de OrganizationDTO si es posible_

- `[SEND]` `plan`
- `[SEND]` `status` - Estado: ACTIVE, CANCELED, PAST_DUE, INCOMPLETE
- `[SEND]` `currentPeriodStart`
- `[SEND]` `currentPeriodEnd`
- `[SEND]` `cancelAtPeriodEnd`

**Para planes ENTERPRISE:**

- `[SEND]` `customMonthlyPrice`
- `[SEND]` `customMonthlyCredits`
- `[SEND]` `customMaxWorkflows`
- `[SEND]` `customFeatures`

---

## 4. CreditTransaction (Historial de Transacciones)

- `[SEND]` `type`
- `[SEND]` `amount`
- `[SEND]` `balanceBefore`
- `[SEND]` `balanceAfter`
- `[SEND]` `workflowCategory`
- `[SEND]` `description`
- `[SEND]` `createdAt`

**Referencias:**

- `[SEND]` `executionId`
- `[SEND]` `invoiceId`

---

## 5. Invoice (Facturas)

- `[SEND]` `invoiceNumber`
- `[SEND]` `type`
- `[SEND]` `status`
- `[SEND]` `periodStart` / `periodEnd`
- `[SEND]` `subtotal`
- `[SEND]` `overageAmount`
- `[SEND]` `tax`
- `[SEND]` `total`
- `[SEND]` `stripeHostedUrl`
- `[SEND]` `stripePdfUrl`
- `[SEND]` `paidAt`
- `[SEND]` `dueAt`

---

## 6. User (Usuarios de la Organización)

- `[SEND]` `email`
- `[SEND]` `name`
- `[SEND]` `role`
- `[SEND]` `isActive`
- `[SEND]` `lastLoginAt`
- `[SEND]` `createdAt`
- `[SEND]` `avatar`
- `[SEND]` `timezone`

---

## 7. Workflow (Agentes/Workflows)

- `[SEND]` `id`
- `[SEND]` `name`
- `[SEND]` `description`
- `[SEND]` `category`
- `[SEND]` `isActive`
- `[SEND]` `isPaused`
- `[SEND]` `version`
- `[SEND]` `triggerType`
- `[SEND]` `schedule`

**Límites:**

- `[SEND]` `maxTokensPerExecution`

**Estadísticas:**

- `[SEND]` `totalExecutions`
- `[SEND]` `successfulExecutions`
- `[SEND]` `failedExecutions`
- `[SEND]` `totalCreditsConsumed`
- `[SEND]` `lastExecutedAt`
- `[SEND]` `avgExecutionTime`

---

## 8. Execution (Ejecuciones de Workflows)

- `[SEND]` `status`
- `[SEND]` `startedAt`
- `[SEND]` `finishedAt`
- `[SEND]` `duration`
- `[SEND]` `trigger`

**Costos:**

- `[SEND]` `credits`
- `[SEND]` `error`
- `[SEND]` `retryCount`

**Relaciones:**

- `[SEND]` `workflowId` (o workflow name/category)
- `[SEND]` `userId` (o user name)
- `[SEND]` `conversationId`

---

## 9. Conversation (Conversaciones)

- `[SEND]` `title`
- `[SEND]` `channel`
- `[SEND]` `status`
- `[SEND]` `isHumanInTheLoop`
- `[SEND]` `messageCount`
- `[SEND]` `lastMessageAt`
- `[SEND]` `createdAt`
- `[SEND]` `closedAt`

**Relaciones:**

- `[SEND]` `workflowId`
- `[SEND]` `userId`
- `[SEND]` `endUserId`

---

## 10. Message (Mensajes de Conversaciones)

- `[SEND]` `role`
- `[SEND]` `content`
- `[SEND]` `attachments`
- `[SEND]` `model` (Opcional, puede ser informativo)
- `[SEND]` `createdAt`

---

## 11. EndUser (Clientes Externos)

- `[SEND]` `phoneNumber`
- `[SEND]` `email`
- `[SEND]` `externalId`
- `[SEND]` `name`
- `[SEND]` `avatar`
- `[SEND]` `metadata`
- `[SEND]` `lastSeenAt`
- `[SEND]` `createdAt`

---

## 12. TenantTool (Conexiones con Tools)

- `[SEND]` `id`
- `[SEND]` `displayName`

---

## 14. ApiKey (API Keys)

- `[SEND]` `name`
- `[SEND]` `description`
- `[SEND]` `isActive`
- `[SEND]` `lastUsedAt`
- `[SEND]` `expiresAt`
- `[SEND]` `createdAt`

---

## 15. WhatsAppConfig (Configuraciones de WhatsApp)

> ⚠️ **Nada de whatsapp funciona aun** - Ignorar

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
