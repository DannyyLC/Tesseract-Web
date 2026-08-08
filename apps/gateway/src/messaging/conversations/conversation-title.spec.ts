import { buildConversationTitle } from './conversation-title';

describe('buildConversationTitle', () => {
  it('toma las primeras cinco palabras, como hacía el panel', () => {
    expect(buildConversationTitle('quiero saber el precio de los tacos al pastor')).toBe(
      'quiero saber el precio de',
    );
  });

  it('deja el mensaje entero cuando tiene menos de cinco palabras', () => {
    expect(buildConversationTitle('Hola buenas tardes')).toBe('Hola buenas tardes');
  });

  it('colapsa los espacios y saltos de línea en vez de contarlos como palabras', () => {
    expect(buildConversationTitle('  hola\n\n   mundo  ')).toBe('hola mundo');
  });

  it.each([
    ['vacío', ''],
    ['solo espacios', '   \n  '],
  ])('devuelve null con un mensaje %s, para no guardar un título en blanco', (_caso, content) => {
    expect(buildConversationTitle(content)).toBeNull();
  });

  it('recorta en el último espacio, sin partir una URL pegada por la mitad', () => {
    // Cortar por palabra deja el título más corto que el tope, que es la gracia: mejor
    // "mira esto…" que medio enlace ilegible.
    expect(
      buildConversationTitle(
        'mira esto https://ejemplo.com/una/ruta/absurdamente/larga/que/nadie/quiere/ver/en/un/titulo aqui',
      ),
    ).toBe('mira esto…');
  });

  it('corta en seco una sola palabra kilométrica, sin dejarla entera', () => {
    const titulo = buildConversationTitle('a'.repeat(200));

    expect(titulo).toBe(`${'a'.repeat(60)}…`);
  });
});
