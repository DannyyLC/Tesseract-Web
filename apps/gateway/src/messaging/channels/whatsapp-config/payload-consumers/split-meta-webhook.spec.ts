import { splitMetaWebhook } from './split-meta-webhook';

describe('splitMetaWebhook', () => {
  const metadata = { display_phone_number: '15550001111', phone_number_id: 'pn-1' };
  const contacts = [{ wa_id: '5215512345678', profile: { name: 'Ana' } }];
  const msg = (id: string) => ({ id, from: '5215512345678', type: 'text', text: { body: id } });

  it('parte un lote en un payload por mensaje, con su contexto', () => {
    const parts = splitMetaWebhook({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-1',
          changes: [
            { field: 'messages', value: { metadata, contacts, messages: [msg('a'), msg('b')] } },
            { field: 'smb_message_echoes', value: { metadata, message_echoes: [msg('c')] } },
          ],
        },
      ],
    });

    expect(parts).toHaveLength(3);
    expect(parts[1]).toEqual({
      object: 'whatsapp_business_account',
      entry: [
        { id: 'waba-1', changes: [{ field: 'messages', value: { metadata, contacts, messages: [msg('b')] } }] },
      ],
    });
    expect(parts[2].entry?.[0].changes?.[0]).toEqual({
      field: 'smb_message_echoes',
      value: { metadata, message_echoes: [msg('c')] },
    });
  });

  it('no produce nada para acuses, otros campos u otros objetos', () => {
    expect(
      splitMetaWebhook({
        object: 'whatsapp_business_account',
        entry: [
          { id: 'waba-1', changes: [{ field: 'messages', value: { metadata, statuses: [{ id: 's' }] } as any }] },
          { id: 'waba-1', changes: [{ field: 'account_update', value: {} }] },
        ],
      }),
    ).toEqual([]);
    expect(splitMetaWebhook({ object: 'page', entry: [] })).toEqual([]);
    expect(splitMetaWebhook({ some: 'payload' } as any)).toEqual([]);
  });
});
