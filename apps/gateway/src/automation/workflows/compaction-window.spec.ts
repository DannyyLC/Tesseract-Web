import { ArchivableMessage, selectMessagesToArchive } from './compaction-window';

const history = (count: number, prefix = 'm'): ArchivableMessage[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `${prefix}${index + 1}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `mensaje ${index + 1}`,
  }));

describe('selectMessagesToArchive', () => {
  const recentToKeep = 7;
  const minBatch = 10;

  it('sin compactación previa archiva todo menos los recientes', () => {
    const result = selectMessagesToArchive({
      fullHistory: history(20),
      sourceMessageToId: null,
      recentToKeep,
      minBatch,
    });

    expect(result.messages).toHaveLength(13);
    expect(result.messages[0].id).toBe('m1');
    expect(result.messages.at(-1)!.id).toBe('m13');
  });

  it('solo considera lo posterior a la compactación anterior', () => {
    // El defecto que arregla: antes se recalculaba desde el índice 0 cada turno, así que
    // se volvía a pagar por resumir contenido que ya estaba en el resumen.
    const result = selectMessagesToArchive({
      fullHistory: history(40),
      sourceMessageToId: 'm20',
      recentToKeep,
      minBatch,
    });

    expect(result.messages[0].id).toBe('m21');
    expect(result.messages).toHaveLength(13);
    expect(result.messages.some((message) => message.id === 'm20')).toBe(false);
  });

  it('no compacta si no hay suficientes mensajes nuevos', () => {
    // Justo después de compactar solo hay unos pocos mensajes nuevos. Sin este mínimo
    // volveríamos a llamar al LLM en cada turno.
    const result = selectMessagesToArchive({
      fullHistory: history(30),
      sourceMessageToId: 'm20',
      recentToKeep,
      minBatch,
    });

    expect(result.messages).toHaveLength(0);
    expect(result.reason).toBe('not-enough-new-messages');
  });

  it('no compacta cuando el historial cabe entero en la ventana reciente', () => {
    const result = selectMessagesToArchive({
      fullHistory: history(5),
      sourceMessageToId: null,
      recentToKeep,
      minBatch,
    });

    expect(result.messages).toHaveLength(0);
    expect(result.reason).toBe('history-too-short');
  });

  it('no compacta cuando no hay nada nuevo tras la compactación anterior', () => {
    // Este es el caso que antes llamaba al LLM con un lote vacío: se pagaba por
    // "consolidar" un resumen sin contenido nuevo, degradándolo.
    const result = selectMessagesToArchive({
      fullHistory: history(20),
      sourceMessageToId: 'm20',
      recentToKeep,
      minBatch,
    });

    expect(result.messages).toHaveLength(0);
  });

  it('degrada a historial completo si el id anterior ya no existe', () => {
    // Un mensaje borrado no debe dejar contenido fuera del resumen para siempre.
    const result = selectMessagesToArchive({
      fullHistory: history(20),
      sourceMessageToId: 'borrado',
      recentToKeep,
      minBatch,
    });

    expect(result.messages).toHaveLength(13);
    expect(result.messages[0].id).toBe('m1');
  });

  it('avanza el punto de corte entre compactaciones sucesivas', () => {
    const fullHistory = history(60);

    const first = selectMessagesToArchive({
      fullHistory: fullHistory.slice(0, 30),
      sourceMessageToId: null,
      recentToKeep,
      minBatch,
    });
    const firstEnd = first.messages.at(-1)!.id;

    const second = selectMessagesToArchive({
      fullHistory,
      sourceMessageToId: firstEnd,
      recentToKeep,
      minBatch,
    });

    // El segundo lote arranca exactamente donde terminó el primero: sin huecos y sin
    // solapamiento.
    expect(second.messages[0].id).toBe('m24');
    expect(firstEnd).toBe('m23');
  });
});
