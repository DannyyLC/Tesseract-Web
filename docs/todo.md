---
title: 'TODO — Deuda técnica detectada'
description: 'Hallazgos pendientes de corregir: cálculo de costos en fan-out, límites de categoría no aplicados, guarda de ventana de contexto, riesgos de despliegue, secretos en el historial y campos inertes en la config de WhatsApp.'
---

Levantado durante la preparación del despliegue del workflow RGM (julio 2026), y ampliado con
lo que salió al migrar el pipeline de WhatsApp a Cloud Tasks (26 de julio de 2026). Nada de
esto bloquea el despliegue; se documenta para no perderlo.

---

## 1. El costo subestima el fan-out paralelo

**Severidad: alta — afecta cálculo de costos reales.**

En [`apps/agents/src/core/usage.py`](https://github.com/FractalOps-Dev/Tesseract/blob/main/apps/agents/src/core/usage.py) el acumulador aplica:

- `output_tokens` → **suma** de todas las llamadas.
- `input_tokens` → **máximo por modelo**, no suma.

El razonamiento documentado es correcto para un agente **secuencial** (un ReAct reenvía el mismo
historial en cada iteración, sumarlo lo contaría N veces). Pero es **falso en un fan-out paralelo**:
cada rama manda su propio historial completo a la API y el proveedor cobra las N. Como además se
agrupa por modelo y todos los verticales del RGM usan `gpt-5.6-luna`, las ramas caen en el mismo
bucket y sobrevive solo una.

**Efecto:** el input se subestima por un factor cercano al número de ramas paralelas activas. Los
outputs están bien.

**Arreglo propuesto:** distinguir llamadas secuenciales de ramas concurrentes. El máximo aplica
dentro de una misma cadena de mensajes; entre ramas paralelas hay que sumar.

---

## 2. Los límites de categoría no se aplican en ningún lado

**Severidad: alta — el límite existe solo en el papel.**

`WORKFLOW_CATEGORIES` en [`packages/types/src/billing/subscriptions/plans.ts`](https://github.com/FractalOps-Dev/Tesseract/blob/main/packages/types/src/billing/subscriptions/plans.ts)
define `maxTokens` y `allowedModelTiers` por categoría, pero:

- `getMaxTokensForCategory()` — **nunca se llama** desde `apps/`.
- `isModelTierAllowed()` — **nunca se llama** desde `apps/`.

Solo se usa `credits`. Consecuencias:

- `maxTokensPerExecution` del workflow no se valida contra el techo de su categoría: se puede
  crear un workflow `LIGHT` con 500k y nadie lo impide.
- La restricción de tiers (`BASIC` solo para `LIGHT`, etc.) no se aplica.

**Arreglo propuesto:** validar en `createWorkflow`/`updateWorkflow` que
`maxTokensPerExecution <= getMaxTokensForCategory(category)`.

---

## 3. No hay guarda contra la ventana de contexto del modelo

**Severidad: media — falla en runtime contra la API del proveedor.**

`contextWindow` se guarda en `llm_models` pero **nunca se consulta en runtime**: solo aparece en
el DTO de creación y en `supersedePricing`. Hoy nada impide configurar un
`maxTokensPerExecution` mayor que la ventana del modelo más chico del workflow; el error saldría
del proveedor, en producción.

Caso concreto: `gpt-5.4-mini` (el router del RGM) tiene ventana de 400k. Un historial de 500k
no le cabe.

**Arreglo propuesto:** al resolver el workflow, tomar la ventana **más chica** entre los modelos
de todos sus agentes y usar como límite efectivo:

```
min(maxTokensPerExecution, ventanaMínima × margen)
```

Ese valor alimenta tanto el umbral de compactación como el hard cap. El margen (reservar 20–25%)
es necesario porque la ventana también aloja system prompts, definiciones de tools y la respuesta.
El que llegue primero manda.

---

## 4. `maxTokensPerExecution` está mal nombrado

**Severidad: baja — pero causa confusión real al configurar.**

El nombre sugiere un presupuesto de consumo de la ejecución. En realidad mide **el historial de
conversación que entra al payload**: todo lo que se compara contra él sale de
`estimateMessageHistoryTokens(...)`, tanto en la compactación como en el hard cap. El fan-out, el
sintetizador y las tools no suman nada ahí.

El comportamiento es correcto: se cuenta lo que se guarda y va a volver a entrar, no lo que se
gastó. Es el nombre el que engaña.

**Arreglo propuesto:** renombrar a `maxHistoryTokens` (requiere migración).

---

## 5. Comentarios desactualizados en el esquema

**Severidad: baja — pero induce a configurar con números viejos.**

Los comentarios del enum `WorkflowCategory` en `packages/database/prisma/schema.prisma` no
coinciden con el código, que es la fuente de verdad:

| Categoría | Comentario en schema.prisma | Real en plans.ts | Propuesto |
|---|---|---|---|
| `LIGHT` | 1 crédito, 20k | 1 crédito, 20k | **50k** |
| `STANDARD` | 5 créditos, 50k | 5 créditos, 100k | **200k** |
| `ADVANCED` | 25 créditos, 128k | 20 créditos, 250k | **300k–350k** |

`ADVANCED` se propone por debajo de 400k a propósito: es la ventana de `gpt-5.4-mini`, el modelo
más chico en uso. Mientras el punto 3 no exista, ese techo es la única protección.

Subir estos límites **no cambia la facturación**: los créditos son fijos por categoría e
independientes de los tokens. Solo permite conversaciones más largas antes de compactar.

---

## 6. Observaciones menores

- **PII en logs.** [`apps/agents/src/tools/whatsapp_outbound.py`](https://github.com/FractalOps-Dev/Tesseract/blob/main/apps/agents/src/tools/whatsapp_outbound.py)
  registra a nivel `INFO` números de teléfono destino y el contenido de las variables de plantilla
  (nombres, montos). Se dejó así a propósito para el primer despliegue; conviene bajarlo a `DEBUG`
  cuando el flujo esté estable. El log del payload completo además duplica lo que ya registra el
  log de `send_bulk_whatsapp`.
- **`"No Disponible"` hardcodeado** en español dentro del constructor de payloads del mismo
  archivo. Si algún template es multi-idioma, ese texto se cuela tal cual al cliente.
- **Cast innecesario.** `conversations.service.ts` usa
  `(NOTIFICATIONSENUM as any).CONVERSATION_NEEDS_FOLLOW_UP ?? '0000-0115'`, pero la clave sí existe
  en el enum. El cast y el fallback sobran.
- **El build de producción compila los tests.** `apps/gateway/tsconfig.json` incluye `src/**/*`, que
  arrastra todos los `.spec.ts` al build del gateway. Excluirlos reduce tiempo y memoria de
  compilación.

---

## 7. Infraestructura

**Severidad: alta — el punto de las variables puede tumbar el servicio.**

- **Las variables de entorno no están versionadas.** `infrastructure/gcp/cloudbuild.yaml` no
  pasa `--set-env-vars`, así que las ~36 variables del servicio `gateway` viven **solo en la
  consola de GCP**. Un servicio recreado desde cero las pierde todas, y no hay forma de saber
  cuál era el valor correcto. Moverlas a Secret Manager, o declararlas en el YAML.

- **Un deploy manual desde la consola ignora el YAML por completo.** Ya causó un incidente: la
  revisión `gateway-00044` traía la anotación `client-name: cloud-console`, así que ninguna de
  las banderas del YAML estaba aplicada. Todo despliegue debe ir por Cloud Build.

- **El trigger de Cloud Build está en `main`, pero se trabaja en `develop`.** Un arreglo
  commiteado en `develop` **no se despliega**. Así fue como el commit `c02fd492` (pool de
  Prisma, timeout de transacción) llevaba días escrito mientras producción corría el código
  viejo. Se confirmó porque los errores en `executions` traían el timeout antiguo de 5000 ms.
  Vale la pena decidir explícitamente si el trigger debe seguir en `main` o moverse.

- **`gcloud run deploy` conserva las banderas que no se le pasan.** Quitar una del YAML **no la
  revierte**. Por eso `--cpu-throttling` está declarado de forma explícita y no simplemente
  omitido. Tenerlo presente al modificar el paso de despliegue.

- **No existe forma de correr el seed en GCP.** El Cloud Run Job `migrate-db` ejecuta
  `prisma migrate deploy` y nada más. El seed se documenta en
  [Aplicar migraciones en GCP](/manuals/migraciones-gcp) como paso posterior, pero no hay Job que lo
  ejecute. Falta crear uno con el mismo patrón (misma imagen, misma conectividad, cambiando el
  `--args` a la tarea de seed).

---

## 8. Alta del workflow RGM

Al insertar `rgm.json` en una organización nueva hay que sustituir dos referencias; el resto del
JSON va por nombre y es portable:

| Referencia | Valor en el archivo | Reemplazar por |
|---|---|---|
| `tool_instance` y `tools` | `ec0f1bf0-e03f-4475-ba57-599ebad41f0c` | UUID del `TenantTool` de WhatsApp de la org |
| `template_id` | `<<TEMPLATE_UUID>>` | UUID de un `WhatsAppTemplate` **activo** de ese `WhatsAppConfig` |

El UUID del tool aparece en dos lugares: el nodo `notify_team` y la lista `tools` del agente
`synthesizer`. Además el workflow debe quedar **ligado** a ese `TenantTool` en la tabla de unión
`_WorkflowToTenantTool`; si la relación no existe, el ID del JSON no resuelve y el agente se queda
sin la tool.

En `TenantTool.config` va únicamente:

```json
{ "whatsapp_config_id": "<uuid del WhatsAppConfig>" }
```

`from_number`, `api_key` y `available_templates` los inyecta el gateway a partir de ese ID.
Ponerlos a mano no sirve: el spread del sistema los sobreescribe.

---

## 9. Seguridad

**Severidad: media-alta — depende de si los secretos coinciden con producción.**

- **Secretos en el historial de git.** El commit `46aed8d1` ("Limpieza") agregó al repositorio
  `rgm_prod_import.sql` y `backup_20260725_164824.sql`, que contenían el `webhookSecret` de
  WhatsApp, un hash bcrypt de contraseña y 8 refresh tokens. Los archivos ya se sacaron del
  índice y `.gitignore` cubre `*.sql` (excepto migraciones), **pero el historial los conserva**.
  Se indicó que esos volcados eran del entorno local de Cristóbal; si aun así el `webhookSecret`
  coincide con el de producción, hay que rotarlo en YCloud y actualizar
  `Y_CLOUD_WEBHOOK_SECRET`. El token de Upstash que estaba en `.env.example` ya fue rotado.

- **Los links de media de YCloud son públicos y quedan persistidos.** Se descargan sin ninguna
  cabecera de autenticación, o sea que quien tenga la URL puede bajar el archivo. El cuerpo
  completo del webhook —incluido ese link— se guarda en `executions.triggerData` y en el buffer
  de Redis. Falta comprobar si esos links expiran:

  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' "<link-viejo-de-ycloud>"
  ```

  Si responde `200`, no expiran y conviene dejar de persistir el cuerpo completo. Si responde
  `403` o `404`, el riesgo es acotado.

---

## 10. Pipeline de WhatsApp — deuda menor

Levantado al migrar a Cloud Tasks. Nada urgente.

**Severidad: baja.**

- **El bitrate asumido para el límite de audio es una estimación.** El webhook no trae la
  duración, solo el link, así que `maxSeconds` se aplica convirtiéndolo a bytes con un bitrate
  supuesto de 32 kbps (`WHATSAPP_ASSUMED_AUDIO_BITRATE_KBPS`). Se eligió el extremo alto del
  rango de Opus a propósito, para errar del lado permisivo. Ahora que `sizeBytes` sí se puebla
  en `message_attachments`, en unas semanas se puede calcular el bitrate real de los audios que
  llegan y reemplazar la suposición por un número medido.

- **`image.maxBytes` y `messages.imageTooLarge` están inertes.** Existen en la política de
  media pero no se usan, porque con las imágenes apagadas nunca se descargan. Decidir si se
  quedan documentados para cuando se active el OCR o se quitan hasta entonces.

- **El OCR le pasa la URL de la imagen directamente a OpenAI.** `extractImageText` manda el
  `sourceUrl` de YCloud dentro del `image_url`, o sea que son los servidores de OpenAI los que
  tienen que descargarla. Como los links son públicos probablemente funcione, pero si expiran
  fallaría de forma intermitente. Solo importa el día que `image.enabled` se ponga en `true`;
  el arreglo sería bajar el binario y mandarlo como data URI en base64.

- **La compactación no se dispara nunca con la configuración actual.** El umbral es 80% de
  `maxTokensPerExecution`, que en el workflow del RGM son ~80 000 tokens (~320 000 caracteres
  de historial). Sus cuatro defectos ya están corregidos, pero conviene revisar el umbral
  cuando haya conversaciones reales que medir. Está relacionado con los puntos 3 y 5.

---

## 11. Campos inertes en `whatsapp_configs`

**Severidad: baja — no rompe nada, pero engaña a quien lee el esquema.**

Levantado el 31 de julio de 2026 al poner los números reales del RGM en producción.

De las 20 columnas de `whatsapp_configs`, el runtime solo lee cuatro: `phoneNumber` (el único
lookup del webhook, `getWhatsappConfigByPhoneNumber` → `findFirst` por match exacto de string),
`isActive`, `defaultWorkflowId` y `organizationId`. `connectionStatus` solo se escribe. El resto
está inerte.

**Importante: nada de esto se debe borrar todavía.** Casi todos los campos muertos son
exactamente los que hacen falta para los dos pendientes de producto —verificación con Meta y
onboarding self-service vía Facebook Login / Embedded Signup— donde el cliente conecta su propio
número sin pasarnos credenciales a mano. Conviene revisarlos cuando eso se implemente, no antes.

| Campo | Estado hoy | Por qué se queda |
|---|---|---|
| `credentialPath` | Solo existe en un DTO, nunca se lee | Destino natural del token por tenant que devuelve el Embedded Signup |
| `webhookUrl` | Se escribe al crear, nunca se lee | Meta exige callback URL por app/número al registrar el webhook |
| `provider` | Nunca se compara | Hoy todo es YCloud; si se conecta la Cloud API de Meta directo, este campo es el discriminante |
| `qrCode` / `qrCodeExpiry` / `sessionData` | Siempre `NULL` | Vienen del diseño para un proveedor tipo Baileys. Son los únicos candidatos reales a borrarse si se confirma que solo habrá proveedores por API oficial |
| `displayName` / `description` | Estaban `NULL`; ya se poblaron para el RGM | Útiles ya: sin esto no se distingue de quién es cada número al consultar la DB |

**El caso aparte es `webhookSecret`.** No es solo inerte: es engañoso. La columna existe con
`@default(uuid())` en [`schema.prisma`](https://github.com/FractalOps-Dev/Tesseract/blob/main/packages/database/prisma/schema.prisma),
o sea que el diseño original era **un secreto por config** (multi-tenant), pero la verificación
real usa `process.env.Y_CLOUD_WEBHOOK_SECRET` en
[`whatsapp-config.service.ts`](https://github.com/FractalOps-Dev/Tesseract/blob/main/apps/gateway/src/messaging/channels/whatsapp-config/whatsapp-config.service.ts):
**un único secreto global para todos los tenants**. Consecuencias:

- Si ese secreto se filtra, cualquiera puede firmar webhooks válidos haciéndose pasar por
  cualquier organización. Con un cliente en producción el riesgo es acotado; con onboarding
  self-service deja de serlo.
- El valor que hay hoy en la fila del RGM (`whsec_b167…`) trae prefijo de Stripe y ya está
  rotado — o sea que nunca fue un secreto de YCloud. Nadie lo notó porque nada lo consulta.
  Esto relativiza el punto 9: el `webhookSecret` que quedó en el historial de git no protegía
  nada.

**Arreglo propuesto (cuando se haga el multi-tenant):** que `verifySignature` resuelva el config
por `phoneNumber` y use `account.webhookSecret`, con fallback a la env var para no romper lo que
ya existe. Mientras tanto, dejar la columna documentada como no usada para que nadie asuma que
está protegiendo algo.

**Riesgo operativo a tener presente:** como `phoneNumber` es el único lookup y es match exacto de
string, el formato con el que YCloud manda el número tiene que coincidir carácter por carácter
con lo guardado (con `+`, sin espacios). Si no coincide, `account` sale `null` y el mensaje se
descarta silenciosamente con `reason: 'inactive-config'` — un 200 y nada en la conversación.
Vale la pena normalizar el número en el lookup en vez de confiar en que ambos lados coincidan.
