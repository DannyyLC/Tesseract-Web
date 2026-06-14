---
title: 'Configuración Local'
description: 'Cómo levantar Tesseract y configurar las variables de entorno según lo que necesites probar.'
---

Esta guía es el punto de partida para cualquier desarrollador. Tesseract es modular, lo que significa que **no necesitas configurar absolutamente todas las variables de entorno si solo vas a trabajar en una parte específica** (ej. si solo vas a hacer diseño UI, no necesitas configurar las llaves de Stripe o KMS).

## 1. Prerrequisitos (Herramientas)

- **Node.js**: v20 LTS o superior (probado también en versiones recientes como v22/v24/v26). Recomendamos usar `nvm` para evitar problemas de permisos globales en Linux/Mac.
- **pnpm**: El gestor oficial del monorepo (versión fijada en `package.json` → `pnpm@11.1.2`). La forma más sencilla de instalarlo es con Corepack: `corepack enable && corepack prepare pnpm@11.1.2 --activate`.
- **Python y Poetry**: Requerido _únicamente_ si tienes planeado modificar y levantar los motores de Inteligencia Artificial locales en `apps/agents`. El proyecto pide **Python 3.11–3.13** (`requires-python = "^3.11"`). Evita Python 3.14 por ahora: LangChain/Pydantic v1 aún no son compatibles y verás un warning al arrancar.
- **PostgreSQL**: (Recomendado mediante contenedor de Docker, incluido en el `docker-compose.yml`).
- **make**: (Opcional pero recomendado) El `Makefile` de la raíz envuelve todos los comandos comunes.
- **Stripe CLI**: (Opcional) Solo si vas a probar el flujo de pagos.

## 2. Instrucciones de Arranque (Comandos Base)

Tienes dos formas equivalentes de trabajar: usando los targets del **`Makefile`** (más cortos) o llamando directamente a los scripts de **pnpm**. Ambos se muestran abajo.

Instala todas las dependencias desde la raíz del proyecto. Esto bajará los paquetes para el gateway, web-client y tipos compartidos:

```bash
make install
# equivalente a:  pnpm install
```

> Las dependencias de Python de `apps/agents` se instalan aparte con `poetry install` (ver más abajo); `pnpm install` no las toca.

### Levantar Infraestructura (Docker)

Antes de sincronizar la base de datos o encender la aplicación, necesitas tener un servidor de PostgreSQL corriendo. Tesseract incluye un archivo `docker-compose.yml` en la raíz que **solo levanta PostgreSQL**.

```bash
make db-up
# equivalente a:  docker-compose up -d
```

> [!WARNING]
> **No corras el Gateway con Docker en modo Desarrollo.**
> El `docker-compose.yml` local está pensado para levantar **únicamente la base de datos**. Si levantaras la API de NestJS dentro del contenedor, perderías la capacidad de hacer _Hot-Reloading_ (recarga automática al guardar el código), forzándote dolorosamente a reconstruir la imagen de Docker tras el más mínimo cambio en el código.

### Sincronizar Base de Datos

El esquema de Prisma vive en el paquete `packages/database`. Una vez que el contenedor de Postgres esté arriba y tu `DATABASE_URL` esté configurada en el `.env`, sincroniza el esquema:

```bash
make prisma-migrate    # pnpm run prisma:migrate    (prisma migrate dev)
make prisma-generate   # pnpm run prisma:generate   (regenera el cliente)
```

Otros comandos útiles de Prisma: `make prisma-studio`, `make prisma-seed`, `make prisma-reset`.

### Levantar los Servicios

Tesseract son **tres procesos** que corren en paralelo. Puedes levantarlos todos de una vez o cada uno por separado.

**Todo junto** (levanta Postgres + gateway + web + agents en una sola terminal):

```bash
make dev
```

**Por separado** (una terminal por servicio):

**Backend (Gateway — NestJS, puerto `3000`):**

```bash
make gateway
# equivalente a:  pnpm run dev:gateway
```

**Agentes de IA (Python — servidor gRPC, puerto `50051`):**
_Solo si vas a modificar herramientas de IA y necesitas el servicio encendido localmente._

```bash
cd apps/agents
poetry install                              # solo la primera vez / cuando cambie pyproject
make agents                                 # desde la raíz; o directamente:
poetry run python src/grpc_server.py
```

> El gateway se conecta al servicio de agentes por gRPC en `localhost:50051` (`AGENTS_GRPC_URL`), así que conviene levantar **agents antes** que el gateway si vas a probar workflows/chat. Ambos comparten el `.env` de la raíz.

**Frontend (Web-Client — Next.js, puerto `3001`):**
(Nota: el frontend asume que el backend está corriendo para poder hacer peticiones a la API).

```bash
make web
# equivalente a:  pnpm run dev:web
```

---

## 3. Variables de Entorno (`.env`)

El proyecto usa **un único `.env` en la raíz**, que comparten tanto el gateway (NestJS) como el servicio de agentes (Python carga `root/.env` vía `python-dotenv`).

> [!NOTE]
> Actualmente el repo **no incluye un `.env.example`**. Pide a tu equipo una copia base del `.env` o créalo a partir de las variables listadas abajo. El gateway valida al arrancar las variables obligatorias y aborta con un mensaje claro si falta alguna (ver `apps/gateway/src/platform/config/env-validation.ts`).

A continuación se explica qué variables son obligatorias y cuáles puedes ignorar dependiendo de la tarea que vayas a realizar. En **desarrollo** solo se exige el bloque "Obligatorias Básicas"; el resto solo es obligatorio en **producción** (`NODE_ENV=production`), aunque las necesitarás según la función que quieras probar localmente.

### Variables Obligatorias Básicas (siempre, incluso en dev)

Estas deben estar siempre configuradas o el gateway no inicializa.

- `DATABASE_URL`: Tu cadena de conexión a Postgres local.
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `TEMP_TOKEN_SECRET`: Llaves secretas para firmar sesiones y tokens temporales. (Pueden ser cualquier string aleatorio en local).

### URLs de comunicación entre servicios

- `NEXT_PUBLIC_API_BASE_URL`: Base de la API que consume Next (típicamente `http://localhost:3000/api`).
- `FRONTEND_URL`: URL del frontend (típicamente `http://localhost:3001`).
- `DOMAIN_BASE_URL`: URL base del dominio de la app.
- `AGENTS_GRPC_URL`: Dirección del servicio de agentes gRPC (default `localhost:50051`).
- `AGENTS_INTERNAL_SECRET`: Secreto compartido entre gateway y agents para autenticar la llamada interna gRPC. **Debe coincidir** en ambos lados.

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
- **Price IDs**: `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_BUSINESS`, `STRIPE_PRICE_PRO` y `STRIPE_PRICE_OVERAGE`. Son los IDs de los productos configurados en tu panel de Stripe. (Si no los pones, fallará al intentar crear una suscripción).

### Agentes e Inteligencia Artificial (Opcionales)

_Solo requieres configurar esto si vas a crear/editar Workflows y usar la opción de "Probar Chat" o ejecutar agentes. Estas llaves las lee el servicio de Python (`apps/agents`)._

- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`: Llaves de los proveedores de IA. (Solo pon la llave del proveedor que vayas a usar).
- `AGENTS_GRPC_URL` y `AGENTS_INTERNAL_SECRET`: Ver la sección de URLs arriba (la conexión gateway → agents ya no es HTTP, es gRPC interno autenticado).

### Procesamiento de Medios y Compactación (Opcionales)

_Servicios externos para transcripción/OCR de archivos y compactación de conversaciones._

- `MEDIA_PROCESSING_API_BASE_URL`, `MEDIA_PROCESSING_API_KEY`: Servicio de STT + OCR.
- `COMPACTION_API_BASE_URL`, `COMPACTION_API_KEY`: Servicio de compactación de conversaciones.

### WhatsApp / YCloud (Opcional)

_Solo si vas a probar el canal de WhatsApp._

- `Y_CLOUD_API_KEY`, `Y_CLOUD_WEBHOOK_SECRET`: Credenciales del proveedor YCloud.

### Integraciones de PII y KMS (Avanzado)

_Solo configurar si vas a probar la conexión de herramientas externas (ToolCatalog) que requieran guardar tokens OAuth de usuarios finales._

- `GCP_PROJECT_ID`, `GCP_KMS_LOCATION`, `GCP_KMS_KEY_RING`, `GCP_KMS_CRYPTO_KEY`: Tesseract cifra los tokens en reposo usando Google Cloud KMS. Si no configuras esto, fallará al intentar guardar una credencial de integración de terceros (ej. Conectar Google Calendar).

### Servicio de Correos (SMTP / Brevo)

_Solo requieres configurar esto si vas a probar correos transaccionales (como verificación de cuenta, reseteo de contraseña)._

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`: Credenciales de conexión SMTP (ej. SMTP de Brevo).
- `SMTP_EMAIL_FROM`: El correo verificado desde donde se enviarán los mensajes (ej. `no-reply@tudominio.com`).
- `SUPPORT_EMAIL_TO`: Correo del equipo que recibirá solicitudes internas como "Nuevo Workflow" (ej. `soporte@tudominio.com`).
