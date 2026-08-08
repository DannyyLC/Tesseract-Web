/** Palabras del mensaje que se usan como título, igual que hacía el panel. */
const TITLE_WORDS = 5;

/**
 * Tope de caracteres. El panel no lo tenía porque el título salía de lo que alguien
 * escribía a mano en el composer; ahora la misma función recibe texto de WhatsApp y
 * Messenger, donde cinco "palabras" pueden ser una URL pegada de 300 caracteres.
 */
const TITLE_MAX_LENGTH = 60;

/**
 * Título tentativo de una conversación a partir de su primer mensaje del usuario.
 *
 * Replica lo que hacía el navegador al crear una conversación desde el panel —las
 * primeras cinco palabras— pero en el gateway, que es por donde pasan todos los canales.
 * Mientras vivió en el front, una conversación de WhatsApp o Messenger no tenía forma de
 * recibir un título y se quedaba en "Sin título" para siempre.
 *
 * Devuelve `null` cuando no hay nada aprovechable (mensaje vacío, o solo un adjunto sin
 * transcribir): quien llama debe dejar el título como estaba y volver a intentarlo con el
 * siguiente mensaje, en vez de guardar una cadena vacía.
 */
export function buildConversationTitle(content: string): string | null {
  const words = content?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length === 0) return null;

  const title = words.slice(0, TITLE_WORDS).join(' ');
  if (title.length <= TITLE_MAX_LENGTH) return title;

  // Se corta en el último espacio para no partir una palabra por la mitad; si no hay
  // ninguno (una sola palabra larguísima), se corta en seco.
  const truncated = title.slice(0, TITLE_MAX_LENGTH);
  const lastSpace = truncated.lastIndexOf(' ');
  return `${lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated}…`;
}
