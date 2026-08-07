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

### Antes de cualquier deploy

El pipeline **no** corre `prisma migrate deploy`: las migraciones se aplican a mano. Cloud SQL es
privado, así que el SQL solo se puede ejecutar desde dentro de la VPC. Antes de cada deploy hay que
saber hasta dónde va producción:

```sql
SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
FROM "_prisma_migrations"
ORDER BY started_at;
```

Se compara contra las carpetas de `packages/database/prisma/migrations/` y se aplican **todas las
posteriores** a la última registrada, en orden. Cómo leer el resultado:

- `finished_at` en NULL y `rolled_back_at` en NULL → migración a medias; **bloquea todas las
  siguientes** hasta resolverla. Es lo primero que hay que buscar.
- Falta en la tabla pero sus objetos ya existen en la base → se aplicó a mano; hay que **registrarla**,
  no re-aplicarla (`prisma migrate resolve --applied <nombre>`, o un INSERT si no hay CLI en la VPC).
- Falta y sus objetos no existen → pendiente de verdad; correr su SQL.

Al aplicar SQL a mano, el renglón de `_prisma_migrations` no se escribe solo. Hay que insertarlo o
un futuro `migrate deploy` intentará recrear lo que ya existe. El `checksum` de la tabla es el
`sha256` del `migration.sql` (`sha256sum <ruta>`), no un valor arbitrario: Prisma lo usa para
detectar archivos editados después de aplicarse.

Para índices en producción, usar `CREATE INDEX CONCURRENTLY` (no bloquea escrituras) y **fuera de
una transacción**. Si falla a medias deja el índice en estado inválido y Postgres nunca lo usa sin
avisar; se verifica con `SELECT indisvalid FROM pg_index WHERE indexrelid = '<nombre>'::regclass;`.

## Convenciones

- Zonas horarias: la fuente de verdad es `Organization.timezone` (IANA, default
  `America/Mexico_City`). `Workflow.timezone` en NULL significa "hereda de la organización";
  un valor explícito es un override. Resuelve siempre con `resolveTimezone()`
  (`platform/common/utils/resolve-timezone.ts`), nunca con `?? 'UTC'`.
- Agrupar por día/hora local: las columnas `DateTime` son `timestamp(3)` **sin** zona, así que
  hace falta la doble conversión `("startedAt" AT TIME ZONE 'UTC') AT TIME ZONE $tz`. Con una
  sola, Postgres lee el valor como hora local y desplaza la serie el offset entero. En TS, las
  claves equivalentes se generan con `platform/common/utils/zoned-dates.ts`; los getters nativos
  de `Date` usan la zona del proceso (UTC en Cloud Run) y no coinciden con el SQL.

- Emails: se normalizan a minúsculas y sin espacios en el borde (transform del DTO), no en
  cada consulta. Util: `platform/common/utils/normalize-email.ts`.
- Segundo factor: toda verificación pasa por `TwoFactorService.verifySecondFactor()`. No
  valides códigos por tu cuenta en un servicio.
