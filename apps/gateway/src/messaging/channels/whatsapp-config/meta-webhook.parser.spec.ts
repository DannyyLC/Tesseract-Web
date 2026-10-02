import { parseMetaWebhook } from './meta-webhook.parser';

describe('parseMetaWebhook', () => {
  const change = (field: string, value: object) => ({
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba-1', changes: [{ field, value }] }],
  });
  const metadata = { display_phone_number: '+52 1 55 1111 1111', phone_number_id: 'pnid-1' };

  it('traduce un mensaje entrante a la forma de YCloud', () => {
    const [event] = parseMetaWebhook(
      change('messages', {
        metadata,
        contacts: [{ wa_id: '5215522222222', profile: { name: 'Ana' } }],
        messages: [
          {
            from: '5215522222222',
            id: 'wamid.A',
            timestamp: '1787000000',
            type: 'text',
            text: { body: 'hola' },
          },
        ],
      }),
    );

    expect(event).toEqual({
      id: 'wamid.A',
      type: 'whatsapp.inbound_message.received',
      apiVersion: 'meta',
      createTime: '2026-08-17T20:53:20.000Z',
      whatsappInboundMessage: expect.objectContaining({
        id: 'wamid.A',
        wamid: 'wamid.A',
        wabaId: 'waba-1',
        from: '+5215522222222',
        to: '+5215511111111',
        sendTime: '2026-08-17T20:53:20.000Z',
        type: 'text',
        text: { body: 'hola' },
        customerProfile: { name: 'Ana' },
      }),
    });
  });

  it('conserva el id del medio porque Meta no manda link', () => {
    const [event] = parseMetaWebhook(
      change('messages', {
        metadata,
        messages: [
          {
            from: '5215522222222',
            id: 'wamid.B',
            type: 'audio',
            audio: { id: 'media-1', mime_type: 'audio/ogg; codecs=opus', sha256: 'h' },
          },
        ],
      }),
    );

    expect(event.whatsappInboundMessage.audio).toEqual({
      id: 'media-1',
      mime_type: 'audio/ogg; codecs=opus',
      sha256: 'h',
      caption: undefined,
    });
    expect(event.whatsappInboundMessage.audio?.link).toBeUndefined();
  });

  it('traduce los echoes de coexistencia con from = negocio y to = cliente', () => {
    const [event] = parseMetaWebhook(
      change('smb_message_echoes', {
        metadata,
        message_echoes: [
          {
            from: '5215511111111',
            to: '5215522222222',
            id: 'wamid.E',
            timestamp: '1787000000',
            type: 'text',
            text: { body: 'ya voy' },
          },
        ],
      }),
    );

    expect(event.type).toBe('whatsapp.smb.message.echoes');
    expect(event.whatsappMessage).toEqual(
      expect.objectContaining({ from: '+5215511111111', to: '+5215522222222', id: 'wamid.E' }),
    );
  });

  it('aplana varios mensajes y entradas de un mismo POST', () => {
    const events = parseMetaWebhook({
      object: 'whatsapp_business_account',
      entry: [
        { id: 'w1', changes: [{ field: 'messages', value: { metadata, messages: [{ id: 'a' }, { id: 'b' }] } }] },
        { id: 'w2', changes: [{ field: 'messages', value: { metadata, messages: [{ id: 'c' }] } }] },
      ],
    });

    expect(events.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('ignora acuses de estado y objetos que no son de WhatsApp', () => {
    expect(
      parseMetaWebhook(change('messages', { metadata, statuses: [{ id: 'wamid.A', status: 'read' }] })),
    ).toEqual([]);
    expect(parseMetaWebhook({ object: 'page', entry: [] })).toEqual([]);
  });
});
