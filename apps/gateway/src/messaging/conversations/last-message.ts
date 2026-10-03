import { ChatRole } from '@tesseract/database';
import { LastMessageAuthor } from '@tesseract/types';

/**
 * Tope de caracteres de la vista previa. Se recorta acá y no en el navegador porque es
 * el payload del listado: una conversación con un mensaje de 4 KB lo mandaría entero
 * para pintar una línea truncada por CSS.
 */
const PREVIEW_MAX_LENGTH = 140;

/**
 * Valores de `Message.metadata.source` que deja un mensaje mandado por una persona
 * desde la app nativa del canal (ver `recordMessageOutsideFlow` en los controladores de
 * WhatsApp y Messenger). Llegan con rol ASSISTANT porque van del negocio al cliente,
 * igual que los del workflow.
 */
const HUMAN_ECHO_SOURCES = new Set(['whatsapp_smb_echo', 'messenger_echo']);

/** Lo que hace falta de un mensaje para saber quién lo escribió. */
interface LastMessageLike {
  role: ChatRole;
  metadata?: unknown;
}

/**
 * Quién escribió el último mensaje, para etiquetarlo en el listado.
 *
 * Se lee la metadata del **mensaje**, no `Conversation.metadata.outsideWorkflow` que
 * escribe `markMessageOutsideWorkflow()`: esa marca es de la conversación y nadie la
 * apaga, así que en cuanto el workflow se reactiva y vuelve a responder, el último
 * mensaje —ya del bot— seguiría apareciendo como escrito por una persona. La metadata
 * del mensaje, en cambio, describe solo ese turno:
 *
 * - `is_hitl_bypass`: lo escribió alguien del equipo desde el panel con la conversación
 *   intervenida (`WorkflowsService`, rama HITL).
 * - `source: whatsapp_smb_echo | messenger_echo`: eco de la app nativa del canal.
 *
 * En una conversación interna (la pestaña Probar, con `userId`) el turno USER lo escribió
 * el propio miembro del equipo, no un cliente.
 */
export function resolveLastMessageAuthor(
  message: LastMessageLike,
  conversation: { userId: string | null },
): LastMessageAuthor {
  if (message.role === ChatRole.USER) {
    return conversation.userId ? 'HUMAN_AGENT' : 'END_USER';
  }

  const metadata = (message.metadata ?? {}) as { is_hitl_bypass?: unknown; source?: unknown };

  if (metadata.is_hitl_bypass === true) {
    return 'HUMAN_AGENT';
  }

  if (typeof metadata.source === 'string' && HUMAN_ECHO_SOURCES.has(metadata.source)) {
    return 'HUMAN_AGENT';
  }

  return 'AI';
}

/**
 * Una línea con el texto del último mensaje.
 *
 * Los saltos de línea se colapsan a espacios: el listado lo pinta en un renglón, y sin
 * esto un mensaje multilínea mandaba los `\n` al navegador para que el CSS los comiera.
 *
 * Devuelve `null` si no queda nada: un mensaje con solo un adjunto tiene autor pero no
 * texto que citar, y quien llama decide qué poner en su lugar.
 */
export function buildLastMessagePreview(content: string | null | undefined): string | null {
  const normalized = content?.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (normalized.length <= PREVIEW_MAX_LENGTH) return normalized;

  // Mismo criterio que `buildConversationTitle`: se corta en el último espacio para no
  // partir una palabra, y en seco si no hay ninguno.
  const truncated = normalized.slice(0, PREVIEW_MAX_LENGTH);
  const lastSpace = truncated.lastIndexOf(' ');
  return `${lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated}…`;
}
