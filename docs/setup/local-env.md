---
title: 'Configuración Local'
description: 'Cómo levantar Tesseract y configurar las variables de entorno según lo que necesites probar.'
---

Esta guía es el punto de partida para cualquier desarrollador. Tesseract es modular, lo que significa que **no necesitas configurar absolutamente todas las variables de entorno si solo vas a trabajar en una parte específica** (ej. si solo vas a hacer diseño UI, no necesitas configurar las llaves de Stripe o KMS).

## 1. Prerrequisitos (Herramientas)

- **Node.js**: (Recomendado v18 o v20 LTS). Recomendamos usar `nvm` para evitar problemas de permisos globales en Linux/Mac.
- **Python y Poetry**: Requerido _únicamente_ si tienes planeado modificar y levantar los motores de Inteligencia Artificial locales en `apps/agents`.
- **PostgreSQL**: (Recomendado mediante contenedor de Docker).
- **npm**: (El gestor oficial del monorepo).
- **Stripe CLI**: (Opcional) Solo si vas a probar el flujo de pagos.

## 2. Instrucciones de Arranque (Comandos Base)

Instala todas las dependencias desde la raíz del proyecto. Esto bajará los paquetes para el gateway, web-client y tipos compartidos:

```bash
npm run install:all
```

Sincroniza la Base de Datos (Asegúrate de tener Postgres corriendo y tu `DATABASE_URL` configurada):

```bash
npm run prisma:migrate
npm run prisma:generate
```

### Levantar los Servicios

**Para trabajar en el Backend (Gateway):**

```bash
npm run dev:gateway
```

**Para trabajar en los Agentes de IA (Python):**
_Solo si tienes planeado modificar herramientas de IA y requieres el servicio encendido localmente._

```bash
cd apps/agents
poetry install
poetry run python src/main.py
```

**Para trabajar en el Frontend (Web-Client):**
(Nota: El frontend asume que el backend está corriendo para poder hacer peticiones a la API).

```bash
npm run dev:web
```

---

## 3. Variables de Entorno (`.env`)

Copia el archivo `.env.example` en la raíz y renómbralo a `.env`.

A continuación se explica qué variables son obligatorias y cuáles puedes ignorar dependiendo de la tarea que vayas a realizar.

### Variables Obligatorias Básicas

Estas deben estar siempre configuradas para que el proyecto inicialice sin crashear.

- `DATABASE_URL`: Tu cadena de conexión a Postgres local.
- `JWT_SECRET`: Llave secreta para firmar sesiones locales. (Puede ser cualquier string aleatorio en local).
- `NEXT_PUBLIC_API_BASE_URL` y `FRONTEND_URL`: Direcciones base para que Next y Nest se comuniquen (típicamente `http://localhost:3000/api` y `http://localhost:3001` respectivamente).

### Seguridad Front-End (Obligatorio para Sign Up / Login)

Para evitar ataques de bots en formularios públicos, usamos Cloudflare Turnstile.

- `TURNSTILE_SECRET_KEY`: (Backend) Llave secreta.
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: (Frontend) Llave pública.
  _Si no las tienes configuradas, no podrás pasar de la pantalla de Login._

### Autenticación con Google (Opcional)

_Solo si vas a probar el flujo de Login o Registro usando "Continuar con Google". Si usas email/contraseña, puedes ignorar esto._

- `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`: Credenciales de tu proyecto en Google Cloud Console.
- `GOOGLE_CALLBACK_URL`: Usualmente `http://localhost:3000/api/auth/google/callback` para el entorno local.

### Facturación y Stripe (Opcionales)

_Solo requieres estas variables si vas a hacer cambios en el código de cobros, suscripciones o overages._

- `STRIPE_SECRET_KEY` & `STRIPE_WEBHOOK_SECRET`: API Keys de prueba de tu panel de desarrollador de Stripe.
- **Price IDs**: Variables como `STRIPE_PRICE_PRO` o `STRIPE_PRICE_OVERAGE`. Estos son los IDs de los productos configurados en tu panel de Stripe. (Si no los pones, fallará al intentar crear una suscripción).

### Agentes e Inteligencia Artificial (Opcionales)

_Solo requieres configurar esto si vas a crear/editar Workflows y usar la opción de "Probar Chat" o ejecutar agentes._

- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`: Llaves de los proveedores de IA. (Solo pon la llave del proveedor que vayas a usar).
- `AGENTS_API_URL`: URL del microservicio de Python (si lo tienes corriendo localmente).

### Integraciones de PII y KMS (Avanzado)

_Solo configurar si vas a probar la conexión de herramientas externas (ToolCatalog) que requieran guardar tokens OAuth de usuarios finales._

- `GCP_PROJECT_ID`, `GCP_KMS_KEY_RING`, `GCP_KMS_CRYPTO_KEY`: Tesseract cifra los tokens en reposo usando Google Cloud KMS. Si no configuras esto, fallará al intentar guardar una credencial de integración de terceros (ej. Conectar Google Calendar).

### Servicio de Correos (SMTP / Brevo)

_Solo requieres configurar esto si vas a probar correos transaccionales (como verificación de cuenta, reseteo de contraseña)._

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`: Credenciales de conexión SMTP (ej. SMTP de Brevo).
- `SMTP_EMAIL_FROM`: El correo desde donde se enviarán los mensajes (ej. `soporte@tudominio.com`).
