---
title: 'Backend: Gateway (NestJS)'
description: 'Estructura profunda de los módulos, servicios y controladores del backend.'
---

El backend (`apps/gateway`) es el cerebro operativo de Tesseract. Está construido sobre **NestJS**, lo que obliga a tener una arquitectura fuertemente tipada (TypeScript), inyección de dependencias y modularidad.

## 1. Arquitectura Modular

El archivo principal de ensamblado es `app.module.ts`, que importa decenas de módulos dedicados. La carpeta `src/` está organizada por dominios de negocio:

- **`auth/` & `users/`**: Gestión de JWT, integración con Passport (Google OAuth20) y registro de cuentas de usuario. Aquí residen los Guards que protegen toda la aplicación.
- **`organizations/`**: Gestión de los _tenants_. Invita usuarios, asigna roles y es el pilar para el control de acceso (RBAC).
- **`workflows/` & `conversations/`**: CRUD de las plantillas de agentes y el historial de charlas de cada sesión iniciada por un usuario final.
- **`executions/` & `agents/` & `llm-models/` & `tools/`**: **El motor de IA.** Orquesta cómo un mensaje de usuario se convierte en un prompt, qué modelo (OpenAI, etc.) se utiliza, y qué herramientas (funciones/APIs) tiene disponibles el agente para responder.
- **`billing/`, `credits/`, `invoice/`**: Módulos responsables de la integración con Stripe, generación de cobros excedentes (overage) y consumo de transacciones por cada mensaje enviado a la IA.
- **`notifications/`**: Sistema de eventos (usualmente WebSockets o Polling) para avisar al cliente sobre estados de background.

## 2. Patrón de Diseño Interno (Por Módulo)

Cada carpeta de módulo (ej. `users/`) sigue el clásico patrón MVC adaptado a APIs:

1.  **Controller (`.controller.ts`)**: Recibe peticiones HTTP, valida los _cuerpos de solicitud_ usando los DTOs de `@tesseract/types`, e invoca al servicio. Es aquí donde se colocan los decoradores de seguridad `@UseGuards(JwtAuthGuard)` o chequeos de permisos RBAC.
2.  **Service (`.service.ts`)**: Contiene la lógica de negocio "dura". Hace validaciones (ej. "¿Tiene la organización créditos suficientes?") e inyecta el `PrismaService` para interactuar con la base de datos.
3.  **Module (`.module.ts`)**: Empaqueta el controlador y el servicio, y exporta el servicio si otro módulo necesita consumirlo (ej. `AuthModule` necesita el `UsersService`).

## 3. Tareas Programadas y Eventos

- **`cron-jobs.service.ts`**: Tesseract usa de fondo `@nestjs/schedule` para procesos recurrentes (Cronjobs). Esto es crucial para tareas como hacer resúmenes diarios, verificar suscripciones que Stripe no reportó, o limpiar cachés.

## 4. Tipado Restricto

El Gateway es el guardián de la integridad de los datos. Se usan librerías como `class-validator` y `class-transformer` dentro de los DTOs para que peticiones maliciosas o mal formateadas reboten con un `400 Bad Request` antes de siquiera tocar la lógica del controlador.
