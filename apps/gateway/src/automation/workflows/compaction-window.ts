/**
 * Decide qué mensajes toca archivar en una compactación.
 *
 * Se aísla aquí, sin dependencias, porque es la única parte de la compactación con
 * reglas de verdad; el resto es leer, llamar al LLM y guardar. Como función pura se
 * puede cubrir con tests sin simular ni la base ni el modelo.
 */

export interface ArchivableMessage {
  id: string;
  role: string;
  content?: string | null;
}

export interface SelectMessagesToArchiveInput {
  /** Historial completo, del más viejo al más nuevo. */
  fullHistory: ArchivableMessage[];
  /** Último mensaje incluido en la compactación anterior, si la hubo. */
  sourceMessageToId?: string | null;
  /** Mensajes recientes que nunca se archivan: son el contexto inmediato. */
  recentToKeep: number;
  /** Mínimo de mensajes nuevos para que valga la pena llamar al LLM. */
  minBatch: number;
}

export interface SelectMessagesToArchiveResult {
  /** Lote a resumir. Vacío significa "no compactar ahora". */
  messages: ArchivableMessage[];
  /** Por qué no se compacta, para poder loguearlo sin adivinar. */
  reason?: 'not-enough-new-messages' | 'history-too-short';
}

export function selectMessagesToArchive({
  fullHistory,
  sourceMessageToId,
  recentToKeep,
  minBatch,
}: SelectMessagesToArchiveInput): SelectMessagesToArchiveResult {
  // Arrancar donde terminó la compactación anterior. Sin esto se re-resumía desde el
  // principio en cada turno: el mismo contenido pagado una y otra vez, y un resumen que
  // se degradaba por resumirse a sí mismo.
  //
  // Si el id ya no existe —por ejemplo si borraron ese mensaje— se degrada a considerar
  // todo el historial, que es correcto aunque más caro. Vale más recompactar de más que
  // dejar mensajes fuera del resumen para siempre.
  const previousIndex = sourceMessageToId
    ? fullHistory.findIndex((message) => message.id === sourceMessageToId)
    : -1;

  const candidates = fullHistory.slice(previousIndex + 1);

  // Los últimos `recentToKeep` se quedan siempre como contexto inmediato del agente.
  const boundary = candidates.length - recentToKeep;

  if (boundary <= 0) {
    return { messages: [], reason: 'history-too-short' };
  }

  const messages = candidates.slice(0, boundary);

  // Sin este mínimo el arreglo se queda a medias: justo después de compactar, el
  // siguiente mensaje ya deja uno archivable y volveríamos a llamar al LLM en cada turno.
  if (messages.length < minBatch) {
    return { messages: [], reason: 'not-enough-new-messages' };
  }

  return { messages };
}
