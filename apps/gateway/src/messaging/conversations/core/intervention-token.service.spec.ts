import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InterventionTokenClaims, InterventionTokenService } from './intervention-token.service';

/**
 * Mismo criterio que `dataset-token.service.spec.ts`: este token es lo único que delimita a qué
 * conversación puede llegar una llamada de la tool determinista de intervención. `JwtService` real,
 * no mock — lo que aporta el servicio es la comprobación criptográfica, y un mock la borraría.
 */
describe('InterventionTokenService', () => {
  const SECRET = 'test-secret';

  const claims: InterventionTokenClaims = {
    organizationId: 'org-1',
    conversationId: 'conv-1',
    workflowId: 'wf-1',
  };

  const rawJwt = new JwtService({});

  let service: InterventionTokenService;
  let configService: { get: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn((key: string) => (key === 'INTERVENTION_TOKEN_SECRET' ? SECRET : undefined)),
    };
    service = new InterventionTokenService(
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
      const token = await service.sign(claims, 300);
      const { exp, iat } = rawJwt.decode(token) as { exp: number; iat: number };

      expect(exp - iat).toBe(600);
    });
  });

  describe('tokens que debe rechazar', () => {
    it('rechaza uno firmado con otro secreto', () => {
      const ajeno = rawJwt.sign(claims, { secret: 'otro-secreto', audience: 'human-intervention' });

      expect(() => service.verify(ajeno)).toThrow(UnauthorizedException);
    });

    it('rechaza uno con otro audience', () => {
      const otroPublico = rawJwt.sign(claims, { secret: SECRET, audience: 'dataset-query' });

      expect(() => service.verify(otroPublico)).toThrow(UnauthorizedException);
    });

    it('rechaza uno sin audience', () => {
      const sinAudience = rawJwt.sign(claims, { secret: SECRET });

      expect(() => service.verify(sinAudience)).toThrow(UnauthorizedException);
    });

    it('rechaza uno expirado', async () => {
      const expirado = await service.sign(claims, -400);

      expect(() => service.verify(expirado)).toThrow(UnauthorizedException);
    });

    it('rechaza uno sin organizationId', () => {
      const incompleto = rawJwt.sign(
        { conversationId: 'conv-1', workflowId: 'wf-1' },
        { secret: SECRET, audience: 'human-intervention' },
      );

      expect(() => service.verify(incompleto)).toThrow(UnauthorizedException);
    });

    it('rechaza uno sin conversationId', () => {
      const incompleto = rawJwt.sign(
        { organizationId: 'org-1', workflowId: 'wf-1' },
        { secret: SECRET, audience: 'human-intervention' },
      );

      expect(() => service.verify(incompleto)).toThrow(UnauthorizedException);
    });

    it('rechaza basura', () => {
      expect(() => service.verify('no-es-un-jwt')).toThrow(UnauthorizedException);
    });
  });

  it('no recae en DATASET_TOKEN_SECRET ni AGENTS_INTERNAL_SECRET', async () => {
    // Cada canal Agents→Gateway tiene su propio secreto a propósito: un respaldo "por si acaso"
    // le devolvería a un token de otro canal la capacidad de forjar intervenciones humanas.
    configService.get.mockImplementation((key: string) =>
      ['DATASET_TOKEN_SECRET', 'AGENTS_INTERNAL_SECRET'].includes(key) ? 'otro-secreto' : undefined,
    );

    await expect(service.sign(claims, 300)).rejects.toThrow(InternalServerErrorException);
  });

  describe('sin INTERVENTION_TOKEN_SECRET', () => {
    beforeEach(() => {
      configService.get.mockReturnValue(undefined);
    });

    it('no firma nada', async () => {
      await expect(service.sign(claims, 300)).rejects.toThrow(InternalServerErrorException);
    });

    it('no deja pasar nada', () => {
      expect(() => service.verify('lo-que-sea')).toThrow(UnauthorizedException);
    });
  });
});
