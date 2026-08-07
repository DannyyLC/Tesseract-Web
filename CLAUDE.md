# Tesseract

Monorepo pnpm + Nx. `apps/gateway` (NestJS), `apps/web-client` (Next.js),
`packages/{database,types,contracts}`.

## Builds

Usa siempre los scripts de la raíz:

```bash
pnpm run build:web        # front
pnpm run build:gateway    # gateway
pnpm run build:all        # database -> types -> gateway -> web
```

**No construyas el front con `next build` ni con `nx build web-client`.** El `.env` del
proyecto define `NODE_ENV=development` para desarrollo local, y `build:web` lo neutraliza
anteponiendo `NODE_ENV=production`. Sin ese prefijo, `next build` genera un bundle de
servidor que mezcla los runtimes de desarrollo y producción de React, y muere al
prerenderizar la ruta interna `/_global-error` con
`Cannot read properties of null (reading 'useContext')`.

Ese error despista: apunta a una ruta que no existe en el repo, no menciona `NODE_ENV` y
sobrevive a limpiar `.next`. No es un bug de Next. Detalle completo en el commit `b09bb78b`.

## Tests

```bash
pnpm exec nx test gateway                          # suite completa
pnpm exec nx test gateway --testPathPattern=identity
```

## Base de datos

Prisma vive en `packages/database`. Tras tocar el schema:

```bash
cd packages/database
pnpm exec prisma migrate dev --name <nombre> --create-only   # revisa el SQL
pnpm exec prisma migrate dev                                 # aplícalo
pnpm exec prisma generate
```

El Postgres local se levanta con `docker compose up -d postgres`.

## Convenciones

- Emails: se normalizan a minúsculas y sin espacios en el borde (transform del DTO), no en
  cada consulta. Util: `platform/common/utils/normalize-email.ts`.
- Segundo factor: toda verificación pasa por `TwoFactorService.verifySecondFactor()`. No
  valides códigos por tu cuenta en un servicio.
