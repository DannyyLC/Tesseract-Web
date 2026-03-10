---
title: 'Esquema de Base de Datos'
description: 'Modelado de datos, tablas centrales y relaciones de Tesseract.'
---

El sistema utiliza una base de datos relacional (PostgreSQL) para asegurar la integridad transaccional, especialmente por la implicación crítica que tiene con la facturación y ejecución de Workflows.

## 1. Entidades Core

### Usuarios (`Users`)

Representa a una persona física que accede a la plataforma por medio de un método de autenticación. Un usuario por sí solo no tiene permisos sustanciales hasta que se asocia a una Organización.

### Organizaciones (`Organizations`)

Es la entidad central del negocio (el "Tenant" o Inquilino).

- Toda la facturación y suscripciones se asocian a la Organización, **NO** al usuario individual.
- Una organización contiene múltiples miembros (Usuarios) y cada miembro cuenta con un **Rol** dentro de ese contexto específico (RBAC).

### Suscripciones (`Subscriptions`)

Registros que hacen match 1:1 con las suscripciones activas (o pendientes) de Stripe.

- **Campos Relevantes:** `stripeSubscriptionId`, `status`, `plan` (FREE, STARTER, PRO), y banderas de control interno como `pendingDowngradeTo`.

### Workflows y Conversaciones (`Workflows`, `Conversations`)

- **Workflow:** Las plantillas lógicas para los agentes. Pertenecen a una Organización.
- **Conversation:** Las ejecuciones en tiempo de ejecución. Pertenecen a un Workflow y acumulan el historial de interacción.

### Transacciones de Créditos (`CreditTransactions`)

Tabla crucial del Motor de Facturación. Registra cada vez que el motor de Workflows consume o asigna créditos (tokens) a una Organización. Contiene referencias directas clave (ej. usando UUIDs y referencias limpias de facturas) para que en el estado de cuenta y uso local haya una transparencia total.

## 2. Relaciones Clave

- **Usuario ↔ Organización:** Relación Muchos-a-Uno directa. Un usuario pertenece a una única Organización (su `organizationId`), y su **rol** (viewer, editor, admin, owner) se guarda directamente en la tabla del Usuario para ese contexto.
- **Organización → Suscripción:** Relación 1:1. Tesseract está diseñado de tal modo que una organización no puede tener múltiples suscripciones de pago activas en paralelo.
- **Organización → Workflows:** Relación 1:Muchos.

## 3. Paginación de Registros

Para cualquier endpoint que devuelva listas (Workflows, Transacciones, Notificaciones), el sistema confía en una capa de DTO estándar (`PaginatedResponse`). Históricamente se utilizaban múltiples cursores o variantes, pero ahora se encuentra estandarizado para toda la aplicación usando Cursores consistentes en lugar del pesado modelo de Offset (limit/offset).
