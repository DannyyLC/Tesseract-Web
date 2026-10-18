---
title: 'TODO — Deuda técnica detectada'
description: 'Hallazgos pendientes de corregir: los tiers de modelo declarados y nunca aplicados, riesgos de despliegue, campos inertes en la config de WhatsApp, la imposibilidad deliberada de cambiar el país de facturación de una organización y el trato que debe recibir un downgrade de plan cuando lo que sobra son datos del cliente.'
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

## 9. Editor de workflows y capacidades de los modelos

- **Guardar un config que el validador rechaza no muestra el motivo.** Reportado el 2026-10-18
  en producción, tras el release de capacidades por modelo: el editor de super admin no deja
  guardar el cambio, pero tampoco dice por qué. El gateway sí responde con el mensaje
  (`Invalid workflow configuration: Agent "…": <modelo> does not accept …`, HTTP 400), así que
  lo que falta es mostrarlo en el editor (toast o el mismo panel de errores que usa "Validar").
  Hay que reproducirlo antes de tocarlo: confirmar qué devuelve el `PUT
  /admin/workflows/:id/config` en ese caso y por qué el editor no lo pinta.

- **Una lista vacía en `allowedParams` acepta cualquier valor, también los inventados.**
  `gpt-6-luna` tiene `{"reasoning_effort": []}`, así que "Validar" da por bueno
  `reasoning_effort: "turbo"` y el error aparece hasta ejecutar (ahora visible: FAILED +
  `LLM_CALL_FAILED`). Es el comportamiento diseñado, no un bug: para que el editor lo rechace,
  cada modelo debe declarar su lista explícita desde el panel de modelos (p.ej. `gpt-6-luna`:
  `reasoning_effort: none, low, medium, high`). Pendiente decidir las listas de
  `gpt-5.4-mini`, `gpt-5.6-luna` y `gpt-6-luna` contra la documentación de OpenAI.

- **El editor no ofrece campos según el modelo.** `model_params` solo se edita en la pestaña
  JSON y `temperature` se muestra aunque el modelo no la acepte. El editor ya recibe la lista
  de modelos; faltaría incluir `supportsTemperature` y `allowedParams` en el contexto del
  editor y pintar un selector por parámetro, deshabilitando `temperature` cuando no aplica.
