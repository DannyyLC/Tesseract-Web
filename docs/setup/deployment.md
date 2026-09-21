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
  3. Desplegar el contenedor en Cloud Run exponiendo el puerto 3000 (Gateway) y 50051 (Agentes, gRPC).
- **Variables Críticas (Gateway):**
  - `DATABASE_URL`: Apuntando a tu instancia de Cloud SQL.
  - `JWT_SECRET`, credenciales de Stripe reales, etc.
  - `AGENTS_GRPC_URL`: URL del servicio de agentes en Cloud Run, **con** el `https://` — de ahí sale la audiencia del ID token (ver §5).

### Identidades (service accounts)

Con qué cuenta corre cada cosa en `fractal-tesseract`. Importa porque el código que usa ADC
(KMS, Cloud Storage, Cloud Tasks, la agenda de reservas) hereda **la identidad de ejecución del
servicio**, no la de quien desplegó.

| Servicio | Service account |
| --- | --- |
| Cloud Run `gateway` | `tesseract-gateway-sa@fractal-tesseract.iam.gserviceaccount.com` |

Se fija con `--service-account` en `gcloud run deploy`. Hoy **no** está en `cloudbuild.yaml`: se
configuró a mano en el servicio y Cloud Run la conserva entre despliegues. Confirmar antes de
concederle permisos nuevos, porque un servicio sin esa bandera cae en la cuenta por defecto de
Compute y el permiso terminaría en la identidad equivocada:

```bash
gcloud run services describe gateway --region=us-central1 --project=fractal-tesseract \
  --format="value(spec.template.spec.serviceAccountName)"
```

Permisos no obvios que tiene concedidos:

- `roles/iam.serviceAccountTokenCreator` **sobre sí misma**, para firmarse la aserción de
  domain-wide delegation con la que la agenda de reservas actúa como `daniel@fractalops.com.mx`.
  Es lo que sustituye a un archivo de llave.

### Base de Datos Relacional

- **Plataforma:** Google Cloud SQL (PostgreSQL).
- **Por qué:** Servicio manejado de Google. Automatiza los _backups_ diarios, actualizaciones de seguridad y permite conectividad privada directa con los contenedores de Cloud Run (sin viajar por la internet pública).

## 2. Visión a Futuro (Evolución de Arquitectura)

Esta arquitectura serverless está diseñada para crecer. Cuando el MVP gane tracción y el procesamiento síncrono sea un cuello de botella, el ecosistema de GCP permite una evolución natural:

1. **Colas de Mensajes:** Reemplazar llamadas HTTP síncronas entre Gateway y Agents por **Google Cloud Pub/Sub**. Para trabajos largos de RAG por ejemplo.
2. **Caché y Estado Rápido:** Integrar **Redis** (Memorystore en GCP) para rate-limiting o validaciones ultrarrápidas.
3. **NoSQL para Logs:** Usar MongoDB o Firestore si guardamos volúmenes masivos de contexto de LLMs que rompen con el esquema relacional purista.

## 3. Base de Datos (Migraciones en Prod)

**CRÍTICO:** Nunca corras `prisma migrate dev` contra producción (puede hacer drop de tablas enteras).

**El pipeline no aplica migraciones.** No corre `prisma migrate deploy` ni nada equivalente: se aplican
a mano, antes de cada deploy. Cloud SQL es privado, así que el SQL solo se puede ejecutar desde dentro
de la VPC.

El procedimiento completo —cómo averiguar hasta dónde va producción, qué hacer con una migración a
medias, cómo registrar una que se aplicó a mano y por qué los índices van con
`CREATE INDEX CONCURRENTLY` fuera de transacción— está en la sección "Antes de cualquier deploy" de
`CLAUDE.md`, en la raíz del repo. Es la fuente de verdad; este documento no la duplica para que no se
desincronicen.

## 4. Linting y Formateo en CI/CD

Cualquier _Pull Request_ hacia la rama principal (`main`) debería ejecutar automáticamente GitHub Actions o Google Cloud Build para verificar:

- `npm run lint`
- `npm run format:check`
- `npm test:all` (Pruebas unitarias conjuntas de Jest y Pytest).

Esto actúa como un escudo antes de desplegar a Vercel o construir las imágenes Docker para Cloud Run.

## 5. Canal Gateway → Agents

El Gateway habla con el servicio de agentes por gRPC. Ese canal ejecuta workflows completos, así que
quien lo alcance puede correr agentes con las credenciales de cualquier organización.

**Cómo se autentica.** El servicio `agents` es privado: solo acepta invocaciones de identidades con
`roles/run.invoker`. El Gateway se identifica con un **ID token** que le emite Google a nombre de su
propia service account; Cloud Run lo valida en el borde, antes de que la petición llegue al proceso de
Python. El token lleva escrita la URL exacta del servicio al que da acceso (el _audience_), que el
Gateway deriva de `AGENTS_GRPC_URL` — de ahí que esa variable tenga que traer el `https://`.

No hay secreto que rotar ni revisión periódica que agendar: la credencial la emite y caduca Google.

**Las probes no se ven afectadas.** Cloud Run las hace contra el puerto del contenedor, no a través del
frontend con IAM, así que el `HealthServicer` de gRPC sigue respondiendo con el servicio cerrado.

### Migración a OIDC (en curso — borrar esta subsección al terminarla)

Hasta que se complete, el canal sigue usando también `AGENTS_INTERNAL_SECRET`, un secreto compartido
que ambos servicios llevan como variable de entorno. Los pasos, **en este orden**:

1. **Desplegar el Gateway con el ID token.** Empieza a mandarlo con el servicio de agentes todavía
   público, así que la cabecera de más se ignora y no hay riesgo. Verificar que las conversaciones
   siguen corriendo.

2. **Confirmar que el token de verdad viaja.** Este paso no es opcional: con el servicio abierto, las
   conversaciones corren igual con token o sin él, así que un error del lado emisor no da ningún
   síntoma hasta el paso 3 — y ahí se manifiesta como caída total. Dos señales:

   ```bash
   gcloud run services describe agents --format='value(status.url)'
   ```

   Esa URL tiene que coincidir con la del log de arranque del Gateway
   (`Agents gRPC ... — OIDC activo (audience: ...)`). Y en Cloud Logging, del lado de `agents`:
   `OIDC: cabecera authorization presente`. Si dice `AUSENTE`, **no se cierra nada todavía**.

3. **Cerrar el servicio.** Quitar `allUsers` de `agents` y darle `roles/run.invoker` a la service
   account del Gateway. Verificar desde Cloud Shell que una petición sin credencial ahora devuelve
   **403** (hoy devuelve `200` con `grpc-status: 2`, que es la señal de que el tráfico anónimo entra).

4. **Retirar el secreto compartido**, en un commit aparte: `AGENTS_INTERNAL_SECRET` del código y de
   ambos servicios, y con él la línea de diagnóstico `_note_oidc_once` de
   `apps/agents/src/grpc_servicer.py`, que existe solo para el paso 2.

**Por qué este orden.** Cerrar primero y adaptar el Gateway después deja el sistema sin agentes hasta
que termine el build y el deploy. Así no hay ventana muerta en ningún momento, y si el paso 3 sale mal
se revierte con un comando de IAM — sin tocar código ni esperar un despliegue.
