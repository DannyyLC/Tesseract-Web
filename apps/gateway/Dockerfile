# ==========================================
# 1. Base Stage: Install dependencies and build monorepo packages
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Instalar dependencias necesarias para build de prisma o node-gyp
RUN apk add --no-cache python3 make g++ openssl

# Copiar archivos de configuración de dependencias desde la raíz del monorepo
COPY package.json package-lock.json ./
# Copiar configuraciones de los sub-paquetes
COPY packages/database/package.json ./packages/database/
COPY packages/types/package.json ./packages/types/
COPY apps/gateway/package.json ./apps/gateway/

# Instalar TODAS las dependencias (incluyendo devDependencies para poder hacer el build)
RUN npm ci

# Copiar el resto del código fuente del monorepo
COPY . .

# Generar Prisma Client
RUN cd packages/database && npx prisma generate

# Construir paquetes compartidos del monorepo (Types y Database)
RUN npm run build -w packages/types
RUN npm run build -w packages/database

# Construir la aplicación principal (Gateway)
RUN npm run build -w apps/gateway


# ==========================================
# 2. Production Stage: Run the built application
# ==========================================
FROM node:22-alpine AS production

WORKDIR /app

# Instalar dependencias del sistema necesarias en prod (ej. OpenSSL para Prisma)
RUN apk add --no-cache openssl

# Copiar configuración de dependencias
COPY package.json package-lock.json ./
COPY packages/database/package.json ./packages/database/
COPY packages/types/package.json ./packages/types/
COPY apps/gateway/package.json ./apps/gateway/

# Instalar SOLO dependencias de producción
RUN npm ci --omit=dev

# Copiar Prisma client generado y el schema (necesario a veces en runtime)
COPY --from=builder /app/packages/database/node_modules/.prisma ./packages/database/node_modules/.prisma
COPY --from=builder /app/packages/database/prisma ./packages/database/prisma

# Copiar los builds compilados (dist) del Gateway y paquetes dependientes
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
