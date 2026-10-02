import { MetaWebhookPayload } from '../dto';

/**
 * Parte un webhook de la Cloud API de Meta en un payload por mensaje.
 *
 * Meta agrupa en un solo POST varios mensajes —y hasta varios números— (`entry[] ×
 * changes[] × messages[]`), pero `MetaPayloadConsumer` lee uno solo: el primero. Sin
 * partirlo, el resto del lote no se guardaba, no se contestaba y nadie se enteraba.
 *
 * Cada parte conserva la forma del original y el contexto que el consumer lee (`object`,
 * el WABA id, `field`, `metadata`, `contacts`), con un único mensaje. Los acuses
 * (`statuses`) y cualquier otro `field` no producen ninguna.
 */
export function splitMetaWebhook(payload: MetaWebhookPayload): MetaWebhookPayload[] {
  if (payload?.object !== 'whatsapp_business_account') return [];

  const parts: MetaWebhookPayload[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const key =
        change.field === 'messages'
          ? 'messages'
          : change.field === 'smb_message_echoes'
            ? 'message_echoes'
            : undefined;
      if (!key) continue;

      const { messages: _messages, message_echoes: _echoes, ...context } = change.value ?? {};
      for (const message of change.value?.[key] ?? []) {
        parts.push({
          object: payload.object,
          entry: [
            {
              id: entry.id,
              changes: [{ field: change.field, value: { ...context, [key]: [message] } }],
            },
          ],
        });
      }
    }
  }
  return parts;
}
