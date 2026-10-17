import { ChatRole } from '@tesseract/database';
import { buildLastMessagePreview, resolveLastMessageAuthor } from './last-message';

describe('resolveLastMessageAuthor', () => {
  const external = { userId: null };
  const internal = { userId: 'u-1' };

  it('un turno USER de una conversación externa es del cliente', () => {
    expect(resolveLastMessageAuthor({ role: ChatRole.USER }, external)).toBe('END_USER');
  });

  it('un turno USER de una conversación interna lo escribió el propio equipo', () => {
    // La pestaña Probar: del otro lado no hay cliente, está el miembro del equipo.
    expect(resolveLastMessageAuthor({ role: ChatRole.USER }, internal)).toBe('HUMAN_AGENT');
  });

  it('un turno ASSISTANT sin metadata es del workflow', () => {
    expect(resolveLastMessageAuthor({ role: ChatRole.ASSISTANT }, external)).toBe('AI');
  });

  it('un ASSISTANT con is_hitl_bypass lo escribió una persona desde el panel', () => {
    expect(
      resolveLastMessageAuthor(
        { role: ChatRole.ASSISTANT, metadata: { is_hitl_bypass: true, original_user_id: 'u-1' } },
        external,
      ),
    ).toBe('HUMAN_AGENT');
  });

  it.each([['whatsapp_smb_echo'], ['messenger_echo']])(
    'un ASSISTANT con source %s es un eco de la app nativa, no del bot',
    (source) => {
      expect(
        resolveLastMessageAuthor({ role: ChatRole.ASSISTANT, metadata: { source } }, external),
      ).toBe('HUMAN_AGENT');
    },
  );

  it.each([
    ['el mensaje de entrada del cliente', 'whatsapp_inbound_message'],
    ['un source desconocido', 'otra_cosa'],
  ])('%s no convierte el turno en humano', (_caso, source) => {
    expect(
      resolveLastMessageAuthor({ role: ChatRole.ASSISTANT, metadata: { source } }, external),
    ).toBe('AI');
  });

  it('no se deja engañar por la marca de conversación: lee solo el mensaje', () => {
    // `markMessageOutsideWorkflow` escribe en la conversación y nadie la apaga; si se
    // leyera de ahí, este turno del bot seguiría apareciendo como escrito por el equipo.
    expect(
      resolveLastMessageAuthor({ role: ChatRole.ASSISTANT, metadata: { source: 'llm' } }, external),
    ).toBe('AI');
  });
});

describe('buildLastMessagePreview', () => {
  it('deja el mensaje tal cual cuando entra completo', () => {
    expect(buildLastMessagePreview('Hola, mi pedido no llegó')).toBe('Hola, mi pedido no llegó');
  });

  it('colapsa saltos de línea y espacios de sobra en un solo renglón', () => {
    expect(buildLastMessagePreview('  hola\n\n   mundo  ')).toBe('hola mundo');
  });

  it.each([
    ['vacío', ''],
    ['solo espacios', '   \n  '],
    ['nulo', null],
    ['ausente', undefined],
  ])('devuelve null con un contenido %s', (_caso, content) => {
    expect(buildLastMessagePreview(content)).toBeNull();
  });

  it('recorta en el último espacio para no partir una palabra', () => {
    const preview = buildLastMessagePreview(`${'palabra '.repeat(30)}final`);

    expect(preview?.endsWith('…')).toBe(true);
    expect(preview?.length).toBeLessThanOrEqual(141);
    expect(preview).not.toContain('palabr…');
  });

  it('corta en seco una sola palabra kilométrica', () => {
    expect(buildLastMessagePreview('a'.repeat(400))).toBe(`${'a'.repeat(140)}…`);
  });
});
