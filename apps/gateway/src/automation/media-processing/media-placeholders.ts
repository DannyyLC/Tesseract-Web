/**
 * Marcadores de texto para la multimedia que no se pudo convertir en texto (un sticker, una
 * ubicación, un audio sin transcribir...).
 *
 * Se guardan en el historial en lugar del contenido. Sin ellos, el mensaje desaparecía: el
 * panel no mostraba que el cliente había mandado algo, y el LLM tampoco lo sabía, así que a
 * "¿cuánto cuesta lo de la foto?" contestaba "¿qué foto?". No se muestran al cliente; lo que
 * él recibe sigue siendo el aviso configurable de la política de media.
 *
 * Son fijos en español a propósito: son contexto para el LLM y para quien lee el panel, no
 * texto de la interfaz, y el LLM los entiende igual sin importar el idioma de la conversación.
 */
export const MEDIA_PLACEHOLDERS = {
  image: '[Imagen]',
  video: '[Video]',
  audio: '[Nota de voz sin transcribir]',
  sticker: '[Sticker]',
  location: '[Ubicación]',
  document: '[Documento]',
  contacts: '[Contacto]',
  reaction: '[Reacción]',
  unsupported: '[Mensaje no soportado]',
} as const;

/**
 * Marcador para un `type` de mensaje o adjunto tal como lo manda el proveedor. WhatsApp y
 * Messenger nombran distinto algunos tipos (`document`/`file`, `contacts`), así que aquí se
 * unifican; lo que no se reconozca cae en el genérico.
 */
export function mediaPlaceholder(rawType: string | undefined): string {
  switch (rawType) {
    case 'image':
      return MEDIA_PLACEHOLDERS.image;
    case 'video':
      return MEDIA_PLACEHOLDERS.video;
    case 'audio':
      return MEDIA_PLACEHOLDERS.audio;
    case 'sticker':
      return MEDIA_PLACEHOLDERS.sticker;
    case 'location':
      return MEDIA_PLACEHOLDERS.location;
    case 'document':
    case 'file':
      return MEDIA_PLACEHOLDERS.document;
    case 'contacts':
      return MEDIA_PLACEHOLDERS.contacts;
    case 'reaction':
      return MEDIA_PLACEHOLDERS.reaction;
    default:
      return MEDIA_PLACEHOLDERS.unsupported;
  }
}
