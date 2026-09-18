---
title: 'TODO — Deuda técnica detectada'
description: 'Hallazgos pendientes de corregir: los tiers de modelo declarados y nunca aplicados, riesgos de despliegue, campos inertes en la config de WhatsApp, la imposibilidad deliberada de cambiar el país de facturación de una organización y el trato que debe recibir un downgrade de plan cuando lo que sobra son datos del cliente.'
---

**Deploy del soporte bilingüe (ES/EN) — pasos manuales en producción.** Hacerlos en este orden:

1. Aplicar a mano la migración `20260918000000_bilingual_tool_catalog` (solo `ADD COLUMN` nullable en `tool_catalog` y `tool_functions`) y registrarla en `_prisma_migrations` con el `sha256` de su `migration.sql`. **Antes** de desplegar el gateway: si no, el catálogo de Integrations responde 500.
2. Ejecutar `packages/database/prisma/seed.sql` en Cloud SQL Studio (idempotente): llena los textos en inglés del catálogo de tools y de las plantillas de notificación. Sin esto todo sigue en español.
3. Desplegar gateway y web-client. Sin variables nuevas: el idioma viaja en el header `X-Locale` y ya está en el CORS.
4. Sabido: las notificaciones ya guardadas en `user_notifications` se quedan en español (no tienen copia en inglés), y `hubspot_crm` y `slack_notif` no tienen traducción en el seed.
5. Tras la v3: quitar el fallback a las columnas base (`displayName`, `description`, `titleTemplate`, `titleSnapshot`…) y hacer obligatorias las `…En`.

Revisar la posibilidad de replicar lo que hace Cal.com en nuestra aplicacion para no depender de un tercero para este aspecto.

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

