import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DatasetTokenClaims, DatasetTokenService } from './dataset-token.service';

/**
 * Este token es lo único que delimita a qué organización y a qué catálogo llega una llamada de la
 * tool del agente. No hay `datasetId` en la ruta que se pueda contrastar, así que si la verificación
 * afloja, afloja el aislamiento entre clientes y nada más lo detecta.
 *
 * Por eso aquí el `JwtService` es REAL y no un mock, contra la convención del resto del repo: lo que
 * aporta este servicio es la comprobación criptográfica —firma, `audience`, expiración— y un mock la
 * borraría entera, dejando un test que pasa igual con o sin las comprobaciones puestas. Sale barato
 * porque el módulo registra `JwtModule.register({})` sin secreto y el secreto viaja por llamada.
 */
describe('DatasetTokenService', () => {
  const SECRET = 'test-secret';

  const claims: DatasetTokenClaims = {
    organizationId: 'org-1',
    datasetId: 'ds-1',
    workflowId: 'wf-1',
  };

  /** Un `JwtService` aparte para fabricar tokens que el servicio debe rechazar. */
  const rawJwt = new JwtService({});

  let service: DatasetTokenService;
  let configService: { get: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    configService = { get: jest.fn().mockReturnValue(SECRET) };
    service = new DatasetTokenService(
      new JwtService({}),
      configService as unknown as ConfigService,
    );
  });

  describe('ida y vuelta', () => {
    it('devuelve los claims intactos', async () => {
      const token = await service.sign(claims, 300);

      expect(service.verify(token)).toMatchObject(claims);
    });

    it('deja margen sobre el timeout del workflow para que no expire a media conversación', async () => {
      // 300 de timeout + 300 de margen: el token sigue vivo bastante después del corte del workflow.
      const token = await service.sign(claims, 300);
      const { exp, iat } = rawJwt.decode(token) as { exp: number; iat: number };

      expect(exp - iat).toBe(600);
    });
  });

  describe('tokens que debe rechazar', () => {
    it('rechaza uno firmado con otro secreto', () => {
      const ajeno = rawJwt.sign(claims, { secret: 'otro-secreto', audience: 'dataset-query' });

      expect(() => service.verify(ajeno)).toThrow(UnauthorizedException);
    });

    it('rechaza uno con otro audience', () => {
      // Es lo que impide que un token de sesión de usuario —firmado con otro secreto, pero la
      // comprobación de audience es la segunda barrera— sirva para leer catálogos.
      const otroPublico = rawJwt.sign(claims, { secret: SECRET, audience: 'otra-cosa' });

      expect(() => service.verify(otroPublico)).toThrow(UnauthorizedException);
    });

    it('rechaza uno sin audience', () => {
      const sinAudience = rawJwt.sign(claims, { secret: SECRET });

      expect(() => service.verify(sinAudience)).toThrow(UnauthorizedException);
    });

    it('rechaza uno expirado', async () => {
      // El margen de 300s se le suma al timeout, así que -400 deja un `expiresIn` de -100.
      const expirado = await service.sign(claims, -400);

      expect(() => service.verify(expirado)).toThrow(UnauthorizedException);
    });

    it('rechaza uno sin organizationId', () => {
      const incompleto = rawJwt.sign(
        { datasetId: 'ds-1', workflowId: 'wf-1' },
        { secret: SECRET, audience: 'dataset-query' },
      );

      expect(() => service.verify(incompleto)).toThrow(UnauthorizedException);
    });

    it('rechaza uno sin datasetId', () => {
      const incompleto = rawJwt.sign(
        { organizationId: 'org-1', workflowId: 'wf-1' },
        { secret: SECRET, audience: 'dataset-query' },
      );

      expect(() => service.verify(incompleto)).toThrow(UnauthorizedException);
    });

    it('rechaza basura', () => {
      expect(() => service.verify('no-es-un-jwt')).toThrow(UnauthorizedException);
    });
  });

  describe('sin AGENTS_INTERNAL_SECRET', () => {
    beforeEach(() => {
      configService.get.mockReturnValue(undefined);
    });

    it('no firma nada', async () => {
      // Fallar cerrado: sin secreto no hay forma de validar el token del otro lado, así que emitir
      // uno sería peor que no emitirlo.
      await expect(service.sign(claims, 300)).rejects.toThrow(InternalServerErrorException);
    });

    it('no deja pasar nada', () => {
      // Sale como 401 y no como 500: el `InternalServerErrorException` que lanza el getter del
      // secreto cae dentro del `try` de `verify()` y el catch lo reetiqueta. Despista al depurar,
      // pero lo que importa aquí es que falla cerrado.
      expect(() => service.verify('lo-que-sea')).toThrow(UnauthorizedException);
    });
  });
});
