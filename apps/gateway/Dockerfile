# ==========================================
# 1. Base Stage: Install dependencies and build monorepo packages
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Instalar dependencias necesarias para build de prisma o node-gyp
RUN apk add --no-cache python3 make g++ openssl && \
    corepack enable && corepack prepare pnpm@11.1.2 --activate

# Copiar archivos de configuración de dependencias desde la raíz del monorepo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Copiar configuraciones de los sub-paquetes
COPY packages/database/package.json ./packages/database/
COPY packages/types/package.json ./packages/types/
COPY apps/gateway/package.json ./apps/gateway/

# Instalar TODAS las dependencias (incluyendo devDependencies para poder hacer el build)
RUN pnpm install --frozen-lockfile

# Copiar el resto del código fuente del monorepo
COPY . .

# Generar Prisma Client (DATABASE_URL dummy para satisfacer validación en build time)
#
# Se invoca el binario directo en vez de `pnpm exec`: antes de ejecutar nada, pnpm 11 corre un
# chequeo de sincronía de dependencias y, si cree que node_modules no cuadra con el lockfile,
# lanza un `pnpm install` por su cuenta. Ver la nota de la etapa de producción, donde eso
# tumbaba el build.
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" sh -c "cd packages/database && ./node_modules/.bin/prisma generate"

# Construir paquetes compartidos del monorepo (Types y Database)
RUN pnpm --filter @tesseract/types build
RUN pnpm --filter @tesseract/database build

# Construir la aplicación principal (Gateway)
# El heap default de Node (~2 GB) no alcanza: nest build corre el plugin de
# swagger sobre todos los DTOs/controladores del gateway.
RUN NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter @tesseract/gateway build


# ==========================================
# 2. Production Stage: Run the built application
# ==========================================
FROM node:22-alpine AS production

WORKDIR /app

# Instalar dependencias del sistema necesarias en prod (ej. OpenSSL para Prisma)
RUN apk add --no-cache openssl && \
    corepack enable && corepack prepare pnpm@11.1.2 --activate

# Copiar configuración de dependencias
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/database/package.json ./packages/database/
COPY packages/types/package.json ./packages/types/
COPY apps/gateway/package.json ./apps/gateway/

# Instalar SOLO dependencias de producción (prisma CLI incluido como dependency)
RUN pnpm install --frozen-lockfile --prod

# Copiar schema y config de Prisma para poder generar el cliente
COPY --from=builder /app/packages/database/prisma ./packages/database/prisma
COPY --from=builder /app/packages/database/prisma.config.ts ./packages/database/prisma.config.ts

# Generar Prisma Client (DATABASE_URL dummy: generate no necesita conexión real)
#
# **No usar `pnpm exec` aquí.** El install de arriba es `--prod`, así que node_modules no tiene
# las devDependencies que el lockfile declara. pnpm 11 corre un chequeo de sincronía antes de
# ejecutar cualquier comando, ve esa diferencia como "desincronizado" y dispara un
# `pnpm install --production` completo de los 4 proyectos del workspace: re-resuelve ~1600
# paquetes contra el registry y revienta el heap default de Node (~2 GB) con un
# `heap out of memory` que tumba el build. Falla de forma intermitente —depende de qué tan
# lento venga el registry—, lo que lo vuelve peor de diagnosticar.
#
# El binario directo evita el chequeo. `prisma` es dependency de producción de
# packages/database (no dev), así que el `--prod` de arriba sí lo instala.
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" sh -c "cd packages/database && ./node_modules/.bin/prisma generate"

# Copiar los builds compilados (dist) del Gateway y paquetes dependientes
COPY --from=builder /app/packages/contracts/proto ./packages/contracts/proto
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/apps/gateway/dist ./apps/gateway/dist

# Exponer el puerto del Gateway
EXPOSE 3000

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000

# Iniciar la aplicación desde el output de NestJS
CMD ["node", "apps/gateway/dist/main.js"]
