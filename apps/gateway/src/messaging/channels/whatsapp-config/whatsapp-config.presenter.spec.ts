import { toPublicConfig } from './whatsapp-config.presenter';

const row = (sessionData: unknown) => ({ id: 'c-1', provider: 'meta', sessionData }) as any;

describe('toPublicConfig', () => {
  it('nunca devuelve sessionData ni los secretos, ni cifrados', () => {
    const out = toPublicConfig(
      row({ phoneNumberId: '123', appSecret: 'kms:v1:AAA', accessToken: 'kms:v1:BBB' }),
    );

    expect(out).not.toHaveProperty('sessionData');
    expect(JSON.stringify(out)).not.toMatch(/kms:v1|AAA|BBB/);
  });

  it('informa qué está cargado', () => {
    expect(
      toPublicConfig(row({ phoneNumberId: '123', appSecret: 'x', accessToken: 'y' })).credentials,
    ).toEqual({ phoneNumberId: '123', hasAppSecret: true, hasAccessToken: true });

    expect(toPublicConfig(row({ accessToken: 'y' })).credentials).toEqual({
      phoneNumberId: null,
      hasAppSecret: false,
      hasAccessToken: true,
    });
  });

  it.each([null, undefined, 'texto', [], 42])('tolera un sessionData raro (%p)', (value) => {
    expect(toPublicConfig(row(value)).credentials).toEqual({
      phoneNumberId: null,
      hasAppSecret: false,
      hasAccessToken: false,
    });
  });
});
