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
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" sh -c "cd packages/database && pnpm exec prisma generate"

# Construir paquetes compartidos del monorepo (Types y Database)
RUN pnpm --filter @tesseract/types build
RUN pnpm --filter @tesseract/database build

# Construir la aplicación principal (Gateway)
RUN pnpm --filter @tesseract/gateway build


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
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" sh -c "cd packages/database && pnpm exec prisma generate"

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
