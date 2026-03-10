---
title: 'Configuración Local'
description: 'Cómo levantar el proyecto completo de Tesseract en tu computadora para desarrollo.'
---

Esta guía es el punto de partida para cualquier desarrollador que quiera trabajar en código para el Frontend, Backend o bases de datos compartidas.

## 1. Prerrequisitos (Herramientas)

Deberás tener instalado en tu máquina (recomendado usar nvm para Node y Docker para bases de datos):

- **Node.js**: (Recomendado v18 o v20 LTS)
- **PostgreSQL**: (Recomendado mediante contenedor de Docker)
- **npm / yarn / pnpm**: (Asegúrate de saber cuál es el gestor oficial del monorepo)
- **Stripe CLI**: Para interceptar los webhooks localmente.

## 2. Variables de Entorno (`.env`)

Existen configuraciones maestras que debes definir antes de intentar correr los servicios. Normalmente encontrarás un archivo `.env.example` en la raíz de cada módulo (Gateway o Web-Client).

Copia ese archivo y renómbralo a `.env`:

```bash
# En el Frontend y en el Backend
cp .env.example .env
```

**Variables Críticas:**

- `DATABASE_URL`: Tu cadena de conexión a Postgres local.
- `JWT_SECRET`: Llave secreta para firmar los tokens de autenticación local.
- `STRIPE_SECRET_KEY` & `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`: API Keys de prueba de tu panel de desarrollador.
- `STRIPE_WEBHOOK_SECRET`: El secreto que el Stripe CLI te otorga al escuchar eventos locamente.

## 3. Instalación e Inicio

Como se trata de un ecosistema en monorepo, generalmente puedes instalar todo desde la raíz:

1.  **Instala las dependencias** (Esto bajará paquetes para el web-client, gateway, y `@tesseract/types`).
    ```bash
    npm install
    ```
2.  **Sincroniza la Base de Datos** (Si usas Prisma o TypeORM, asegúrate de correr los scripts de migración).
    ```bash
    npm run db:migrate # (O el comando configurado)
    ```
3.  **Levanta los servicios**
    Normalmente, puedes iniciar el Frontend y el Backend en paralelo para el desarrollo.
    ```bash
    npm run dev
    ```

## 4. Estilo de Código (ESLint)

El proyecto cuenta con estrictas reglas de TypeScript. Antes de hacer un _commit_, asegúrate de revisar:

- El código de ambos módulos comparta configuraciones de ESLint similares.
- No dejar tipos `any` esparcidos (trátalos como warnings al menos temporalmente como pasa en el web-client).
- Emplear _Optional Chaining_ (`?.`) en lugar de coerciones directas (`!`).

## Siguientes Pasos

Una vez que el proyecto compila, dirígete a la sección de [Pruebas Locales (Stripe)](/setup/stripe-local) para asegurar que la facturación y la base de datos se puedan comunicar al emular compras.
