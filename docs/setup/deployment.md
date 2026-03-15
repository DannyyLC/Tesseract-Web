---
title: 'Despliegue y Arquitectura'
description: 'Estrategia de infraestructura serverless optimizada para un MVP escalable.'
---

Tesseract utiliza una arquitectura híbrida aprovechando lo mejor de dos mundos: **Vercel** para el ecosistema Frontend (Next.js) y **Google Cloud Platform (GCP)** para el Backend, Base de Datos y Motores de IA.

Esta estrategia está diseñada para ser un MVP altamente eficiente en costos (aprovechando cuotas gratuitas y _Scale-to-Zero_) sin sacrificar la capacidad de escalar masivamente si el tráfico lo demanda.

## 1. Arquitectura de Hosting

### Frontend (Web-Client)

- **Plataforma:** Vercel.
- **Por qué:** Integración continua automática desde GitHub. Despliegues _Edge_ ultrarrápidos, optimización de imágenes nativa y capa gratuita generosa para MVPs.
- **Directorio Raíz (Root Directory):** `.` (Vercel detecta automáticamente que es un Monorepo y la carpeta `apps/web-client`).
- **Variables Críticas:**
  - `NEXT_PUBLIC_API_BASE_URL`: Apuntando a la URL pública de tu Gateway en GCP.
  - `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: Llave de Cloudflare.

### Backend (Gateway) y Agentes (Python)

- **Plataforma:** Google Cloud Run (Serverless Containers).
- **Por qué:** Cloud Run permite correr contenedores Docker sin administrar servidores. Su mayor ventaja para este MVP es el **Autoscaling** y el **Scale-to-Zero** (si en la madrugada nadie usa el sistema, no pagas por el Gateway o los Agentes encendidos).
- **Despliegue:**
  1. Construir las imágenes Docker (`Dockerfile` en la raíz para el Gateway, `Dockerfile` en `apps/agents` para Python).
  2. Subirlas a Google Artifact Registry.
  3. Desplegar el contenedor en Cloud Run exponiendo el puerto 3000 (Gateway) y 8000 (Agentes).
- **Variables Críticas (Gateway):**
  - `DATABASE_URL`: Apuntando a tu instancia de Cloud SQL.
  - `JWT_SECRET`, credenciales de Stripe reales, etc.
  - `AGENTS_API_URL`: Apuntando a la URL interna del servicio de agentes en Cloud Run.

### Base de Datos Relacional

- **Plataforma:** Google Cloud SQL (PostgreSQL).
- **Por qué:** Servicio manejado de Google. Automatiza los _backups_ diarios, actualizaciones de seguridad y permite conectividad privada directa con los contenedores de Cloud Run (sin viajar por la internet pública).

## 2. Visión a Futuro (Evolución de Arquitectura)

Esta arquitectura serverless está diseñada para crecer. Cuando el MVP gane tracción y el procesamiento síncrono sea un cuello de botella, el ecosistema de GCP permite una evolución natural:

1. **Colas de Mensajes:** Reemplazar llamadas HTTP síncronas entre Gateway y Agents por **Google Cloud Pub/Sub**. Para trabajos largos de RAG por ejemplo.
2. **Caché y Estado Rápido:** Integrar **Redis** (Memorystore en GCP) para rate-limiting o validaciones ultrarrápidas.
3. **NoSQL para Logs:** Usar MongoDB o Firestore si guardamos volúmenes masivos de contexto de LLMs que rompen con el esquema relacional purista.

## 3. Base de Datos (Migraciones en Prod)

**CRÍTICO:** Nunca debes correr `prisma migrate dev` en un entorno de producción (hace drop de tablas enteras a veces).
El proceso correcto durante el despliegue a Cloud Run (usualmente en la fase de CI/CD via GitHub Actions o Cloud Build) es:

1. Generar el cliente de Prisma: `npm run prisma:generate`
2. Aplicar las migraciones de forma segura: `npm run prisma:migrate:deploy`
3. Iniciar el servidor (Gateway): `node dist/apps/gateway/main.js`

## 4. Linting y Formateo en CI/CD

Cualquier _Pull Request_ hacia la rama principal (`main`) debería ejecutar automáticamente GitHub Actions o Google Cloud Build para verificar:

- `npm run lint`
- `npm run format:check`
- `npm test:all` (Pruebas unitarias conjuntas de Jest y Pytest).

Esto actúa como un escudo antes de desplegar a Vercel o construir las imágenes Docker para Cloud Run.
