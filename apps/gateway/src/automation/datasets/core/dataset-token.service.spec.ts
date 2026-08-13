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

    // Mira la clave, no devuelve el secreto a cualquiera que pregunte: si no, el spec seguiría en
    // verde aunque el servicio leyera la variable equivocada, que es justo lo que hay que impedir.
    configService = {
      get: jest.fn((key: string) => (key === 'DATASET_TOKEN_SECRET' ? SECRET : undefined)),
    };
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

  it('no recae en AGENTS_INTERNAL_SECRET', async () => {
    // La llave de estos tokens es exclusiva del Gateway. `AGENTS_INTERNAL_SECRET` vive también en el
    // servicio de agentes, y como HS256 firma y verifica igual, usarlo aquí le devolvería a ese
    // servicio la capacidad de emitirse tokens para cualquier organización. Un respaldo "por si
    // acaso" reabriría el agujero en silencio, así que este test existe para que no compile la idea.
    configService.get.mockImplementation((key: string) =>
      key === 'AGENTS_INTERNAL_SECRET' ? 'el-secreto-compartido' : undefined,
    );

    await expect(service.sign(claims, 300)).rejects.toThrow(InternalServerErrorException);
  });

  describe('sin DATASET_TOKEN_SECRET', () => {
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
