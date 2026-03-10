---
title: 'Despliegue y CI/CD'
description: 'Estrategias y consideraciones para mandar Tesseract a producción.'
---

Tesseract/Fractal, al ser un ecosistema tipo monorepo, tiene un flujo de despliegue ligeramente diferente al de aplicaciones individuales.

## 1. Opciones de Hosting Recomendadas

Debido a que tenemos un Frontend en Next.js y un Backend en Node.js (NestJS), se recomienda desplegar cada parte en un entorno optimizado para su runtime.

### Frontend (Web-Client)

- **Recomendación:** Vercel.
- **Comando de _Build_:** `npm run build:types && npm run build:web`
- **Directorio raíz (Root Directory):** `.`, pero el comando de compilación debe apuntar al workspace. (o Vercel detecta automáticamente el _Monorepo_ y la carpeta `apps/web-client`).
- **Variables Críticas:** Asegúrate de incluir la URL pública del Gateway (`NEXT_PUBLIC_API_URL`) y llaves públicas de Stripe.

### Backend (Gateway)

- **Recomendación:** Render, Railway, AWS ECS o un Servidor VPS con Docker.
- **Startup Command:** `npm run start:prod --workspace=@tesseract/gateway`
- **Variables Críticas:**
  - `DATABASE_URL` apuntando a tu instancia de Postgres de producción (Ej: Supabase, RDS).
  - `JWT_SECRET` fuerte para firmar sesiones.
  - Variables reales de Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).

## 2. Base de Datos (Migraciones en Prod)

**CRÍTICO:** Nunca debes correr `prisma migrate dev` en un entorno de producción.
El proceso correcto durante el Pipeline (CI/CD) de despliegue del Backend es:

1.  Generar el cliente de Prisma: `npm run prisma:generate`
2.  Aplicar las migraciones existentes sin resetear los datos: `npm run prisma:migrate:deploy`
3.  Iniciar el servidor NestJS: `node dist/apps/gateway/main.js`

## 3. Dockerización (Opcional)

Si prefieres orquestar todo tú mismo en un VPS (Ej. DigitalOcean Droplet), el repositorio incluye soporte de contenedores a través del archivo `docker-compose.yml` en la raíz (típicamente usado para desarrollo local con Postgres/Redis), pero puedes expandirlo con dos `Dockerfile` separados:

- Un `Dockerfile.web` usando la salida "Standalone" de Next.js.
- Un `Dockerfile.gateway` copiando la carpeta `dist/apps/gateway` y los `node_modules` rooteados.

## 4. Linting y Formateo en CI

Cualquier Pull Request a la rama principal (main) debería ejecutar idealmente GitHub Actions o un pipeline similar que corra los comandos definidos en `package.json`:

- `npm run lint`
- `npm run format:check`
- `npm test:all` (Opcional, si existen pruebas automatizadas escritas para el Gateway o Web-Client).
  Esto garantiza que la homogeneidad introducida por `@tesseract/types` se respete y que nadie inyecte código que choque con ESLint.
