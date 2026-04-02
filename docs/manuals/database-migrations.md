---
title: 'Migraciones de Base de Datos'
description: 'Proceso manual y seguro para aplicar migraciones de Prisma a Cloud SQL (PostgreSQL) en producción usando Cloud SQL Auth Proxy.'
---

Las migraciones se aplican **de forma manual y deliberada** — nunca se automatizan en CI/CD. Este proceso usa Cloud SQL Auth Proxy para crear un túnel TLS encriptado desde tu máquina local hacia Cloud SQL, sin exponer la base de datos al internet público ni manejar whitelists de IPs.

> **Instancia:** `fractal-tesseract:us-central1:tesseract-db`
> **Base de datos:** `tesseract` (la base `postgres` es del sistema — nunca se toca)
> **Usuario:** `postgres`

---

## Checklist rápido

1. [ ] Autenticar gcloud y ADC
2. [ ] Tomar backup en Cloud SQL Console
3. [ ] Revisar el SQL de la migración
4. [ ] Levantar el Auth Proxy
5. [ ] Ejecutar `prisma migrate deploy`
6. [ ] Verificar tablas y registro de migraciones
7. [ ] Cerrar el proxy

---

## 1. Autenticación

### 1.1 Login de gcloud CLI

Solo necesario la primera vez o cuando la sesión expira:

```bash
gcloud auth login
```

### 1.2 Configurar el proyecto activo

```bash
gcloud config set project fractal-tesseract
```

### 1.3 Application Default Credentials (ADC)

Las ADC son las credenciales que usan las librerías y herramientas como el Auth Proxy. Son independientes del login del CLI — se configuran una sola vez por máquina o cuando expiran:

```bash
gcloud auth application-default login
```

Durante el flow del navegador, aceptar **ambos** permisos:
- Ver, editar, configurar y borrar datos de Google Cloud
- Ver y acceder a instancias de Cloud SQL

Al terminar, verificar que el output incluya:

```
Quota project "fractal-tesseract" was added to ADC which helps billing and quota.
```

Si ese mensaje **no aparece**, configurar el quota project manualmente:

```bash
gcloud auth application-default set-quota-project fractal-tesseract
```

> Las ADC necesitan saber a qué proyecto de GCP facturar las llamadas de librerías como el Auth Proxy. Si el quota project no está configurado, el proxy puede fallar con errores de permisos aunque el login haya sido exitoso.

### 1.4 Verificar autenticación

Antes de continuar, confirmar que la cuenta y el proyecto son los correctos:

```bash
gcloud auth list
gcloud config get-value project
# Esperado: fractal-tesseract
```

---

## 2. Instalar Cloud SQL Auth Proxy

Solo necesario la primera vez. El binario se reutiliza en futuras migraciones.

```bash
curl -o cloud-sql-proxy \
  https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.1/cloud-sql-proxy.linux.amd64

chmod +x cloud-sql-proxy
./cloud-sql-proxy --version
```

Para obtener el connection name de la instancia (ya conocido, solo como referencia):

```bash
gcloud sql instances describe tesseract-db --format="value(connectionName)"
# Output: fractal-tesseract:us-central1:tesseract-db
```

---

## 3. Backup antes de migrar

**Este paso es obligatorio.** Es la red de seguridad — si algo sale mal se puede restaurar al estado anterior.

GCP Console → Cloud SQL → `tesseract-db` → **Backups** → **Create backup**

Esperar a que el backup quede en estado `Succeeded` antes de continuar.

---

## 4. Revisar el SQL de la migración

Desde la raíz del proyecto, revisar el archivo SQL antes de ejecutar cualquier cosa:

```bash
cat prisma/migrations/<timestamp>_nombre/migration.sql
```

Verificar que **no haya** instrucciones destructivas inesperadas:

```bash
# Buscar operaciones de DROP en la migración
grep -i "DROP" prisma/migrations/<timestamp>_nombre/migration.sql
```

Si hay un `DROP TABLE` o `DROP COLUMN` que no esperabas — detener y revisar antes de continuar.

---

## 5. Levantar el Auth Proxy

Abrir una **terminal separada y dedicada**. El proxy debe quedar corriendo durante toda la migración.

```bash
# Desde el directorio donde se descargó el binario

# Opción A — Puerto 5432 (cuando no hay PostgreSQL local corriendo):
./cloud-sql-proxy fractal-tesseract:us-central1:tesseract-db --port=5432

# Opción B — Puerto 5433 (cuando hay un contenedor de postgres local usando el 5432):
./cloud-sql-proxy fractal-tesseract:us-central1:tesseract-db --port=5433
```

El proxy escucha en `127.0.0.1` (loopback) — solo accesible desde la máquina local, nunca expuesto en red.

Si aparece `address already in use`, matar procesos previos colgados:

```bash
pkill -f cloud-sql-proxy
```

---

## 6. Configurar el password

Usar comillas simples para que zsh no interprete caracteres especiales (`!`, `@`, `$`, etc.):

```bash
DB_PASS='password-de-la-instancia'
```

Encodear el password para que caracteres especiales no rompan la URL de conexión:

```bash
ENCODED_PASS=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${DB_PASS}', safe=''))")
```

---

## 7. Ejecutar la migración

Desde donde está la carpeta `prisma/`:

```bash
# Puerto 5432:
DATABASE_URL="postgresql://postgres:${ENCODED_PASS}@127.0.0.1:5432/tesseract" \
  npx prisma migrate deploy

# Puerto 5433:
DATABASE_URL="postgresql://postgres:${ENCODED_PASS}@127.0.0.1:5433/tesseract" \
  npx prisma migrate deploy
```

**`migrate deploy` vs `migrate dev`:**

| Comando | Uso | Comportamiento |
|---|---|---|
| `migrate deploy` | Producción | Solo aplica migraciones pendientes en orden |
| `migrate dev` | Desarrollo local | Interactivo, puede resetear la DB — **nunca en producción** |

---

## 8. Verificar la migración

```bash
# Ver todas las tablas creadas:
psql "postgresql://postgres:${ENCODED_PASS}@127.0.0.1:5432/tesseract" -c "\dt"

# Ver el registro de migraciones de Prisma:
psql "postgresql://postgres:${ENCODED_PASS}@127.0.0.1:5432/tesseract" \
  -c "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at;"
```

Si `psql` no está instalado:

```bash
sudo apt-get install -y postgresql-client
```

---

## 9. Cerrar el proxy

`Ctrl+C` en la terminal donde corre el proxy. No hay nada más que limpiar.

---

## Solución de problemas

### El proxy no conecta

```bash
# Verificar que las ADC estén vigentes:
gcloud auth application-default print-access-token

# Si expiraron, renovar:
gcloud auth application-default login
```

### Error de autenticación en la URL de conexión

Caracteres especiales en el password rompen la URL. Verificar que `ENCODED_PASS` se generó correctamente:

```bash
echo $ENCODED_PASS
```

Si está vacío, reasignar `DB_PASS` y volver a encodear.

### Migración falla a mitad

`migrate deploy` es transaccional cuando el motor de base de datos lo permite. Verificar el estado antes de reintentar:

```bash
psql "postgresql://postgres:${ENCODED_PASS}@127.0.0.1:5432/tesseract" \
  -c "SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5;"
```

Si la migración quedó en estado `rolled_back_at`, es seguro corregir el SQL y volver a ejecutar `migrate deploy`.

---

## Notas

- El Project ID de GCP (`fractal-tesseract`) no es secreto — la seguridad descansa en IAM, no en ocultar el ID
- El password de producción debe vivir en Secret Manager — nunca en `.env` commiteados ni en texto plano
- Siempre correr la migración en staging primero si el cambio es destructivo
