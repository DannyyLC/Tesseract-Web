import { BadRequestException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { MessengerConfigService } from './messenger-config.service';

/** Error con la forma que axios le da a un rechazo de Meta: el motivo va en el cuerpo. */
const metaError = (message: string) =>
  Object.assign(new Error('Request failed with status code 400'), {
    isAxiosError: true,
    response: { data: { error: { message, type: 'OAuthException', code: 190 } } },
  });

/** Respuesta de `/debug_token`; por defecto, un token de página sano. */
const debugToken = (overrides: Record<string, unknown> = {}) => ({
  data: {
    data: {
      type: 'PAGE',
      profile_id: 'p-1',
      is_valid: true,
      scopes: ['pages_messaging'],
      ...overrides,
    },
  },
});

/**
 * Antes de guardar una página, Meta tiene que confirmar que el token es de esa página y que el
 * App Secret es de la misma app. La prueba es `/debug_token`: introspecciona el token
 * autenticando con el app access token, de modo que un solo viaje contesta las dos cosas.
 *
 * El `appId` que hace falta para armar ese app access token no se pide ni se guarda: sale
 * del propio token con `GET /app`, así que cada verificación empieza por ahí.
 *
 * La mitad de estos casos existen porque la versión anterior (`GET /me` + `appsecret_proof`)
 * los rechazaba siendo credenciales buenas.
 */
describe('MessengerConfigService.assertCredentialsOwnPage', () => {
  const http = { get: jest.fn() };
  const kms = { decrypt: jest.fn() };
  const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
  const service = new MessengerConfigService(
    {} as any,
    http as any,
    kms as any,
    {} as any,
    {} as any,
    logger as any,
  );

  /**
   * Enruta por URL. Toda verificación pega primero a `/app` para derivar la app del token,
   * así que esa ruta trae una respuesta por defecto y cada caso solo declara lo que le importa.
   */
  const respond = (routes: Record<string, unknown>) => {
    routes = { '/app': { data: { id: 'app-1' } }, ...routes };
    http.get.mockImplementation((url: string) => {
      const match = Object.keys(routes).find((route) => url.endsWith(route));
      if (!match) throw new Error(`URL inesperada en el test: ${url}`);
      const value = routes[match];
      return value instanceof Error ? throwError(() => value) : of(value);
    });
  };

  /** Params de la llamada a una de las dos rutas. */
  const paramsFor = (route: string) =>
    http.get.mock.calls.find(([url]: [string]) => url.endsWith(route))?.[1]?.params;

  beforeEach(() => {
    jest.clearAllMocks();
    // `clearAllMocks` borra las llamadas, no las implementaciones: la del recorte se
    // filtraría a los tests de después si no se repusiera aquí.
    kms.decrypt.mockImplementation((v: string) => Promise.resolve(`dec(${v})`));
  });

  it('deriva la app del token y acepta el que es de esa página', async () => {
    respond({ '/debug_token': debugToken() });

    await expect(
      service.assertCredentialsOwnPage({ pageId: 'p-1', pageAccessToken: 'tok', appSecret: 'sec' }),
    ).resolves.toBeUndefined();

    // El App ID no se le pide al usuario: está en el propio token.
    expect(paramsFor('/app')).toEqual({ fields: 'id', access_token: 'tok' });
    expect(paramsFor('/debug_token')).toEqual({ input_token: 'tok', access_token: 'app-1|sec' });
  });

  it('rechaza un token de usuario diciendo que es de usuario, no de página', async () => {
    // El caso más común: el que el Graph API Explorer enseña por defecto.
    respond({ '/debug_token': debugToken({ type: 'USER', profile_id: undefined }) });

    await expect(
      service.assertCredentialsOwnPage({ pageId: 'p-1', pageAccessToken: 'tok', appSecret: 'sec' }),
    ).rejects.toThrow(/tipo USER, no de página/);
  });

  it('rechaza el token de otra página nombrando la que es', async () => {
    respond({ '/debug_token': debugToken({ profile_id: 'p-atacante' }) });

    await expect(
      service.assertCredentialsOwnPage({ pageId: 'p-1', pageAccessToken: 'tok', appSecret: 'sec' }),
    ).rejects.toThrow(/es de la página p-atacante, no de la p-1/);
  });

  it('rechaza un token caducado con el motivo que da Meta', async () => {
    respond({
      '/debug_token': debugToken({
        is_valid: false,
        error: { code: 190, message: 'Session has expired' },
      }),
    });

    await expect(
      service.assertCredentialsOwnPage({ pageId: 'p-1', pageAccessToken: 'tok', appSecret: 'sec' }),
    ).rejects.toThrow(/Session has expired/);
  });

  it('cuando Meta rechaza el app access token, culpa al par App ID + App Secret', async () => {
    // Autenticar `/debug_token` es lo que prueba que el secreto es de esa app, así que un
    // fallo aquí no es del token que se está revisando y el mensaje no debe sugerirlo.
    respond({ '/debug_token': metaError('Invalid OAuth access token') });

    await expect(
      service.assertCredentialsOwnPage({
        pageId: 'p-1',
        pageAccessToken: 'tok',
        appSecret: 'secreto-de-otra-app',
      }),
    ).rejects.toThrow(/App ID app-1 con ese App Secret: Invalid OAuth access token/);
  });

  it('cuando Meta rechaza el token al derivar la app, culpa al token', async () => {
    respond({ '/app': metaError('Error validating access token') });

    await expect(
      service.assertCredentialsOwnPage({ pageId: 'p-1', pageAccessToken: 'tok', appSecret: 'sec' }),
    ).rejects.toThrow(/no reconoció el Page Access Token: Error validating access token/);
  });

  it('no loguea el error de axios entero, solo el cuerpo que responde Meta', async () => {
    // La URL lleva el token en claro en los params; el cuerpo del error no trae credenciales.
    respond({ '/debug_token': metaError('Invalid OAuth access token') });

    await expect(
      service.assertCredentialsOwnPage({
        pageId: 'p-1',
        pageAccessToken: 'tok-secreto',
        appSecret: 'sec',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const logged = logger.error.mock.calls.flat().join(' ');
    expect(logged).toContain('Invalid OAuth access token');
    expect(logged).not.toContain('tok-secreto');
  });

  it('sin credenciales no llama a Meta ni cae a las de la plataforma', async () => {
    await expect(service.assertCredentialsOwnPage({ pageId: 'p-1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(http.get).not.toHaveBeenCalled();
  });

  it('completa con las credenciales guardadas lo que no viene en la petición', async () => {
    respond({ '/debug_token': debugToken({ profile_id: 'p-2' }) });

    await service.assertCredentialsOwnPage(
      { pageId: 'p-2' },
      { pageAccessToken: 'enc-tok', appSecret: 'enc-sec' },
    );

    expect(kms.decrypt).toHaveBeenCalledWith('enc-tok');
    expect(paramsFor('/debug_token')).toEqual({
      input_token: 'dec(enc-tok)',
      access_token: 'app-1|dec(enc-sec)',
    });
  });

  it('recorta lo que sale de KMS: un salto de línea viaja como %0A y Meta lo rechaza', async () => {
    kms.decrypt.mockImplementation((v: string) => Promise.resolve(`dec(${v})\n`));
    respond({ '/debug_token': debugToken() });

    await service.assertCredentialsOwnPage(
      { pageId: 'p-1' },
      { pageAccessToken: 'enc-tok', appSecret: 'enc-sec' },
    );

    expect(paramsFor('/debug_token')).toEqual({
      input_token: 'dec(enc-tok)',
      access_token: 'app-1|dec(enc-sec)',
    });
  });

  it('avisa pero no bloquea cuando falta pages_messaging o el token caduca', async () => {
    // Rechazar de más es justo lo que esta reescritura vino a arreglar.
    respond({
      '/debug_token': debugToken({ scopes: ['pages_show_list'], expires_at: 1767225600 }),
    });

    await expect(
      service.assertCredentialsOwnPage({ pageId: 'p-1', pageAccessToken: 'tok', appSecret: 'sec' }),
    ).resolves.toBeUndefined();

    const warned = logger.warn.mock.calls.flat().join(' ');
    expect(warned).toContain('pages_messaging');
    expect(warned).toContain('caduca');
  });
});
