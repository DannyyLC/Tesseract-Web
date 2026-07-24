import {
  evaluateWhen,
  runPostTurnActions,
  PostTurnAction,
} from './post-turn-actions';

describe('evaluateWhen', () => {
  it('not_empty matchea valores presentes', () => {
    expect(evaluateWhen({ variable: 'media_url' }, { media_url: 'https://x' })).toBe(true);
    expect(evaluateWhen({ variable: 'media_url', op: 'not_empty' }, { media_url: 'https://x' })).toBe(true);
  });

  it('not_empty rechaza vacío, null y ausente', () => {
    expect(evaluateWhen({ variable: 'media_url' }, {})).toBe(false);
    expect(evaluateWhen({ variable: 'media_url' }, { media_url: '' })).toBe(false);
    expect(evaluateWhen({ variable: 'media_url' }, { media_url: '   ' })).toBe(false);
    expect(evaluateWhen({ variable: 'media_url' }, { media_url: null })).toBe(false);
  });

  it('eq y neq comparan contra value', () => {
    expect(evaluateWhen({ variable: 'x', op: 'eq', value: true }, { x: true })).toBe(true);
    expect(evaluateWhen({ variable: 'x', op: 'eq', value: true }, { x: false })).toBe(false);
    expect(evaluateWhen({ variable: 'x', op: 'neq', value: true }, { x: false })).toBe(true);
  });

  it('when inválido no matchea', () => {
    expect(evaluateWhen(undefined, { x: 1 })).toBe(false);
    expect(evaluateWhen({ variable: '' }, { x: 1 })).toBe(false);
  });
});

describe('runPostTurnActions', () => {
  const shareAction: PostTurnAction = {
    id: 'share_catalog',
    when: { variable: 'media_url', op: 'not_empty' },
    action: 'send_drive_folder_media',
    params: { intro_message: 'Te comparto archivos' },
    once_per_conversation: true,
  };

  it('ejecuta el handler con el valor disparador y los params', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const flags = await runPostTurnActions({
      actions: [shareAction],
      variables: { media_url: 'https://a,https://b' },
      doneFlags: {},
      handlers: { send_drive_folder_media: handler },
    });

    // El id de la accion viaja al handler para que el canal atribuya lo que envia
    expect(handler).toHaveBeenCalledWith(
      'https://a,https://b',
      { intro_message: 'Te comparto archivos' },
      'share_catalog',
    );
    expect(flags).toEqual({ share_catalog: true });
  });

  it('once_per_conversation: no re-ejecuta si el flag ya existe', async () => {
    const handler = jest.fn();
    const flags = await runPostTurnActions({
      actions: [shareAction],
      variables: { media_url: 'https://a' },
      doneFlags: { share_catalog: true },
      handlers: { send_drive_folder_media: handler },
    });

    expect(handler).not.toHaveBeenCalled();
    expect(flags).toEqual({ share_catalog: true });
  });

  it('condición sin match: no ejecuta ni marca flag', async () => {
    const handler = jest.fn();
    const flags = await runPostTurnActions({
      actions: [shareAction],
      variables: {},
      doneFlags: {},
      handlers: { send_drive_folder_media: handler },
    });

    expect(handler).not.toHaveBeenCalled();
    expect(flags).toEqual({});
  });

  it('error del handler: no marca flag (reintenta el siguiente turno) y no bloquea otras acciones', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('boom'));
    const ok = jest.fn().mockResolvedValue(undefined);
    const flags = await runPostTurnActions({
      actions: [
        shareAction,
        {
          id: 'notify',
          when: { variable: 'media_url' },
          action: 'send_text_message',
          params: { text: 'hola' },
          once_per_conversation: true,
        },
      ],
      variables: { media_url: 'https://a' },
      doneFlags: {},
      handlers: { send_drive_folder_media: failing, send_text_message: ok },
    });

    expect(ok).toHaveBeenCalled();
    expect(flags).toEqual({ notify: true });
  });

  it('acción sin handler disponible se ignora con warning', async () => {
    const log = jest.fn();
    const flags = await runPostTurnActions({
      actions: [{ ...shareAction, action: 'accion_inexistente' }],
      variables: { media_url: 'https://a' },
      doneFlags: {},
      handlers: {},
      log,
    });

    expect(flags).toEqual({});
    expect(log).toHaveBeenCalledWith('warn', expect.stringContaining('accion_inexistente'));
  });

  it('sin once_per_conversation ejecuta cada turno y no marca flag', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const action = { ...shareAction, once_per_conversation: false };
    const flags = await runPostTurnActions({
      actions: [action],
      variables: { media_url: 'https://a' },
      doneFlags: {},
      handlers: { send_drive_folder_media: handler },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(flags).toEqual({});
  });
});
