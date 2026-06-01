---
title: 'Aplicar Migraciones en GCP (Cloud Run Job)'
description: 'Método para aplicar migraciones de Prisma a Cloud SQL (instancia con IP privada) usando un Cloud Run Job, sin VM ni IP pública.'
---

La instancia de Cloud SQL **no tiene IP pública**, por lo que el Cloud SQL Auth Proxy desde tu
máquina local **no funciona** (tu equipo está fuera de la VPC y no puede alcanzar la IP privada).

El método correcto es correr las migraciones **desde dentro de GCP**, con un **Cloud Run Job** que
reutiliza la imagen del gateway (ya trae Prisma, el `schema.prisma` y las migraciones) y la misma
conectividad a la base que el servicio gateway (Direct VPC egress + Cloud SQL).

```
Cloud Shell  ──(lanza)──>  Cloud Run Job  ──(/cloudsql socket)──>  Cloud SQL (IP privada)
   (tú aquí)                (corre en GCP)                          (la app conecta aquí)
```

> **Instancia:** `fractal-tesseract:us-central1:tesseract-db`
> **Base de datos:** `tesseract`
> **Usuario de la app (dueño del schema):** `tesseract_app`
> **Usuario admin:** `postgres`
> **Job:** `migrate-db` (región `us-central1`)
> **Secret:** `DATABASE_URL` (Secret Manager) — usa el socket `?host=/cloudsql/...`

---

## Caso normal: re-ejecutar las migraciones

Si **no** agregaste migraciones nuevas (o solo quieres aplicar pendientes), basta ejecutar el Job. Es
idempotente: aplica solo lo que falte, si no hay nada pendiente no hace cambios.

**Consola:** Cloud Run → **Trabajos** → `migrate-db` → **Ejecutar**.

**CLI (Cloud Shell):**

```bash
gcloud run jobs execute migrate-db --region=us-central1 --wait
```

Resultado esperado: `Execution [...] has successfully completed` y `1 / 1 complete`.

---

## Caso con migraciones nuevas

El Job **congela el digest de la imagen** al momento de crearse/actualizarse. Aunque apunte a
`gateway:latest`, NO toma automáticamente el último build. Si agregaste un archivo nuevo en
`packages/database/prisma/migrations/`, primero hay que re-apuntar el Job a la imagen que lo contiene:

```bash
# 1. (Después de que el build haya subido la imagen nueva)
gcloud run jobs update migrate-db \
  --image=us-central1-docker.pkg.dev/fractal-tesseract/tesseract-repo/gateway:latest \
  --region=us-central1

# 2. Aplicar
gcloud run jobs execute migrate-db --region=us-central1 --wait
```

### Orden recomendado en cada release con migraciones

1. **Build** → genera la imagen nueva (con las migraciones).
2. **`jobs update`** → re-apunta el Job a esa imagen.
3. **`jobs execute`** → aplica las migraciones.
4. **Deploy del gateway** → recién entonces, para que el código nuevo nunca pegue contra tablas que
   aún no existen.

---

## Crear el Job desde cero

Solo si el Job `migrate-db` no existe. Replica la conectividad del gateway (Direct VPC egress +
Cloud SQL) y usa su service account para tener acceso al secret y a la base.

```bash
# Service account del gateway (acceso al secret DATABASE_URL y a Cloud SQL)
GW_SA=$(gcloud run services describe gateway --region=us-central1 \
  --format='value(spec.template.spec.serviceAccountName)')

gcloud run jobs create migrate-db \
  --image=us-central1-docker.pkg.dev/fractal-tesseract/tesseract-repo/gateway:latest \
  --region=us-central1 \
  --service-account="$GW_SA" \
  --set-cloudsql-instances=fractal-tesseract:us-central1:tesseract-db \
  --network=default \
  --subnet=default \
  --vpc-egress=private-ranges-only \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest \
  --command=pnpm \
  --args=--filter,@tesseract/database,exec,prisma,migrate,deploy \
  --max-retries=1 \
  --task-timeout=600
```

> Nota: en **Jobs** el flag es `--set-cloudsql-instances` (en **Services** es `--add-cloudsql-instances`).
> Si el gateway usara un VPC connector en vez de Direct VPC egress, cambia `--network/--subnet/--vpc-egress`
> por `--vpc-connector=<nombre>`.

---

## Verificación

Logs de la última ejecución del Job:

```bash
gcloud logging read \
  'resource.type="cloud_run_job" AND resource.labels.job_name="migrate-db"' \
  --freshness=20m --limit=100 --order=asc --format='value(textPayload)'
```

Buscar la línea `Applying migration ...` y que termine sin `Error`. Para ver el estado de las
migraciones en la base, usar **Cloud SQL Studio** (consola → SQL → `tesseract-db` → Studio, login con
`postgres`):

```sql
SELECT migration_name, finished_at, rolled_back_at
FROM "_prisma_migrations" ORDER BY started_at DESC;
```

Tras migrar, el gateway no se redesplega solo: crea una revisión nueva para que tome el cambio.

```bash
gcloud run deploy gateway \
  --image=us-central1-docker.pkg.dev/fractal-tesseract/tesseract-repo/gateway:latest \
  --region=us-central1
```

---

## Solución de problemas

### `P3009` — migración fallida bloquea las demás

Prisma marcó una migración como fallida y no aplica nuevas hasta resolverla. Si la migración falló en
su **primera** instrucción (no aplicó nada), basta borrar su registro en Cloud SQL Studio (como
`postgres`) y volver a ejecutar el Job:

```sql
DELETE FROM "_prisma_migrations"
WHERE migration_name = '<timestamp>_<nombre_migracion>';
```

Si aplicó parte de las instrucciones, revisa el `migration.sql` y limpia a mano lo que haya quedado a
medias antes de reintentar (o restaura el backup).

### `42501: must be owner of type/table ...`

El usuario `tesseract_app` no es dueño del objeto que la migración intenta alterar (`ALTER TYPE`,
`ALTER TABLE`, etc.). Pasa cuando el schema lo creó otro usuario (p. ej. `postgres`). Solución
definitiva: hacer que `tesseract_app` sea dueño de todo. En **Cloud SQL Studio**, logueado como
`postgres`:

```sql
GRANT tesseract_app TO postgres;             -- permite a postgres reasignar al rol destino
REASSIGN OWNED BY postgres TO tesseract_app; -- tesseract_app pasa a ser dueño de los objetos
```

Esto solo cambia el **dueño** de los objetos en la base `tesseract` (no borra ni modifica datos) y es
reversible. Toma un backup antes por seguridad. Después, reintenta el Job.

> Si Cloud SQL Studio da `permission denied to reassign objects`, asegúrate de estar logueado como
> `postgres` (no como `tesseract_app`).

### Backup antes de operar

Antes de cualquier migración destructiva o de tocar ownership:

```bash
gcloud sql backups create --instance=tesseract-db
```

Esperar a estado `Succeeded` (consola → SQL → `tesseract-db` → Copias de seguridad).

### El Job corre una imagen vieja

El Job congela el digest al crearse/actualizarse. Si no ves tu migración nueva, corre `jobs update`
con la imagen correcta antes de `jobs execute` (ver "Caso con migraciones nuevas").

---

## Notas

- El Job es **idempotente**: re-ejecutarlo sin migraciones pendientes no hace nada.
- `migrate deploy` (producción) solo aplica migraciones pendientes en orden. Nunca usar `migrate dev`
  ni `migrate reset` contra Cloud SQL — pueden borrar datos.
- El Project ID (`fractal-tesseract`) no es secreto; la seguridad descansa en IAM.
- El password/credenciales de producción viven en Secret Manager (`DATABASE_URL`), nunca en `.env`
  commiteados.
