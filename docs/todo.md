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
  `maxHistoryTokens`, que en el workflow del RGM son ~80 000 tokens (~320 000 caracteres
  de historial). Sus cuatro defectos ya están corregidos, pero conviene revisar el umbral
  cuando haya conversaciones reales que medir. Relacionado con el punto 4. Ojo con un efecto de
  la guarda de ventana de contexto: el umbral cuelga del límite **efectivo**, no del configurado,
  así que un workflow puede empezar a compactar antes que ayer sin que nadie haya tocado su
  configuración.
