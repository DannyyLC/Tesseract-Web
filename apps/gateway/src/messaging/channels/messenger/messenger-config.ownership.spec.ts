import { createHmac } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { MessengerConfigService } from './messenger-config.service';

/**
 * Antes de guardar una página, Meta tiene que confirmar que el token es de esa página y que el
 * App Secret es de la misma app. Cada caso es una forma de colar credenciales que no prueban eso.
 */
describe('MessengerConfigService.assertCredentialsOwnPage', () => {
  const http = { get: jest.fn() };
  const kms = { decrypt: jest.fn(async (v: string) => `dec(${v})`) };
  const service = new MessengerConfigService(
    {} as any,
    http as any,
    kms as any,
    {} as any,
    {} as any,
    { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('acepta cuando Meta dice que el token es de esa página y manda el appsecret_proof', async () => {
    http.get.mockReturnValue(of({ data: { id: 'p-1' } }));

    await expect(
      service.assertCredentialsOwnPage({ pageId: 'p-1', pageAccessToken: 'tok', appSecret: 'sec' }),
    ).resolves.toBeUndefined();

    const params = http.get.mock.calls[0][1].params;
    expect(params.access_token).toBe('tok');
    expect(params.appsecret_proof).toBe(createHmac('sha256', 'sec').update('tok').digest('hex'));
  });

  it('rechaza el token de otra página', async () => {
    http.get.mockReturnValue(of({ data: { id: 'p-atacante' } }));
    await expect(
      service.assertCredentialsOwnPage({ pageId: 'p-1', pageAccessToken: 'tok', appSecret: 'sec' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza si Meta no acepta el token o el appsecret_proof', async () => {
    http.get.mockReturnValue(throwError(() => new Error('400 Invalid appsecret_proof')));
    await expect(
      service.assertCredentialsOwnPage({ pageId: 'p-1', pageAccessToken: 'tok', appSecret: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sin credenciales no llama a Meta ni cae a las de la plataforma', async () => {
    await expect(service.assertCredentialsOwnPage({ pageId: 'p-1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(http.get).not.toHaveBeenCalled();
  });

  it('completa con las credenciales guardadas lo que no viene en la petición', async () => {
    http.get.mockReturnValue(of({ data: { id: 'p-2' } }));
    await service.assertCredentialsOwnPage(
      { pageId: 'p-2' },
      { pageAccessToken: 'enc-tok', appSecret: 'enc-sec' },
    );
    expect(kms.decrypt).toHaveBeenCalledWith('enc-tok');
    expect(http.get.mock.calls[0][1].params.access_token).toBe('dec(enc-tok)');
  });
});
