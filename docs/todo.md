---
title: 'TODO — Deuda técnica detectada'
description: 'Hallazgos pendientes de corregir: el prompt caching sin modelar en el cálculo de costos, los tiers de modelo declarados y nunca aplicados, riesgos de despliegue, secretos en el historial, campos inertes en la config de WhatsApp, la imposibilidad deliberada de cambiar el país de facturación de una organización y el trato que debe recibir un downgrade de plan cuando lo que sobra son datos del cliente.'
---

Debemos de traducir todo el texto del back y el servicio de agentes para que la aplicaicon sea completamente multiidioma.

## 1. El cálculo de costo no modela el prompt caching

**Severidad: baja — el número queda por arriba del real, nunca por debajo.**

`input_tokens` es la suma de todas las llamadas al LLM, que es lo que factura el proveedor a precio
de lista. Pero los proveedores descuentan fuerte el prefijo repetido, y ese caso es justo el más
común: las iteraciones de un loop agéntico reenvían el mismo historial. O sea que el `costUSD` que
se guarda por ejecución es un **techo**, no el número exacto.

`usage_metadata` ya trae el desglose en `input_token_details.cache_read`, pero hoy nada en el repo lo
lee y `llm_models` no tiene columna de precio de input cacheado.

**Arreglo propuesto:** separar el input fresco del cacheado en
[`usage.py`](https://github.com/FractalOps-Dev/Tesseract/blob/main/apps/agents/src/core/usage.py) y
cobrar cada uno a su tarifa. Requiere una columna nueva en `llm_models` con su migración y sumarla al
CRUD de modelos del admin.

---

## 7. Seguridad

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

## 8. Pipeline de WhatsApp — deuda menor

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
  cuando haya conversaciones reales que medir. Relacionado con el punto 4. Ojo con un efecto de
  la guarda de ventana de contexto: el umbral cuelga del límite **efectivo**, no del configurado,
  así que un workflow puede empezar a compactar antes que ayer sin que nadie haya tocado su
  configuración.

---

## 9. Campos inertes en `whatsapp_configs`

**Severidad: baja — no rompe nada, pero engaña a quien lee el esquema.**

Levantado el 31 de julio de 2026 al poner los números reales del RGM en producción.

De las 20 columnas de `whatsapp_configs`, el runtime solo lee cuatro: `phoneNumber` (el único
lookup del webhook, `getWhatsappConfigByPhoneNumber`), `isActive`, `defaultWorkflowId` y
`organizationId`. `connectionStatus` solo se escribe. El resto
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
  Esto relativiza el punto 7: el `webhookSecret` que quedó en el historial de git no protegía
  nada.

**Arreglo propuesto (cuando se haga el multi-tenant):** que `verifySignature` resuelva el config
por `phoneNumber` y use `account.webhookSecret`, con fallback a la env var para no romper lo que
ya existe. Mientras tanto, dejar la columna documentada como no usada para que nadie asuma que
está protegiendo algo.

**Lo único que queda del riesgo del formato** (el lookup ya tolera las diferencias desde
`891d400f`): la equivalencia solo está escrita para México —el `1` de móvil—, así que un número de
un país con una regla análoga, como el `9` de Argentina, seguiría cayendo en el descarte
silencioso. Son unas líneas más en `phoneNumberVariants` el día que haya operación ahí.

---

## 10. Los descartes del webhook no tienen observabilidad

**Severidad: baja — no se está ciego, pero nadie se entera hasta que el cliente reclama.**

Son **cinco** las rutas por las que un mensaje del cliente termina en un 200 sin dejar rastro en la
conversación: `unknown-config`, `inactive-config`, `no-workflow`, `missing-workflow` e
`inactive-workflow` — más `blocked-contact`, que sí es deliberado. Cada una deja su `warn` en Cloud
Logging, así que el dato está; lo que falta es un contador o una alerta que lo saque a flote sin
que alguien vaya a buscarlo. Si se agrega, conviene cubrir las cinco de una vez.