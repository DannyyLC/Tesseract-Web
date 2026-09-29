import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OauthStateService } from './oauth-state.service';

/**
 * El callback de OAuth no tiene sesión: el `state` es lo único que dice a qué tool y a nombre de
 * quién se guardan los tokens de Google. Cada caso es una forma de colar un `state` que el
 * gateway no emitió, o de reusar uno que sí.
 */
describe('OauthStateService', () => {
  const SECRET = 'secreto-de-prueba';
  const claims = { tenantToolId: 'tool-1', organizationId: 'org-1', userId: 'user-1' };

  let jwt: JwtService;
  let config: { get: jest.Mock };
  let dedup: { claim: jest.Mock };
  let service: OauthStateService;

  beforeEach(() => {
    jwt = new JwtService({});
    config = { get: jest.fn((key: string) => (key === 'OAUTH_STATE_SECRET' ? SECRET : undefined)) };
    dedup = { claim: jest.fn().mockResolvedValue(true) };
    service = new OauthStateService(jwt, config as any, dedup as any);
  });

  it('devuelve los claims de un state propio y lo marca como usado', async () => {
    const state = await service.sign(claims);

    await expect(service.consume(state)).resolves.toEqual(claims);
    expect(dedup.claim).toHaveBeenCalledWith('tools-oauth-state', expect.any(String));
  });

  it('rechaza el formato viejo: JSON en base64 sin firma', async () => {
    const forged = Buffer.from(JSON.stringify({ t: 'tool-1', o: 'org-1', u: 'user-1' })).toString(
      'base64',
    );
    await expect(service.consume(forged)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(dedup.claim).not.toHaveBeenCalled();
  });

  it('rechaza un state firmado con otra llave', async () => {
    const forged = await jwt.signAsync(claims, {
      secret: 'otra-llave',
      audience: 'tools-oauth-state',
      jwtid: 'x',
    });
    await expect(service.consume(forged)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza un token con la misma llave pero de otro propósito', async () => {
    const other = await jwt.signAsync(claims, {
      secret: SECRET,
      audience: 'otra-cosa',
      jwtid: 'x',
    });
    await expect(service.consume(other)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza un state al que le cambiaron la tool', async () => {
    const [header, , signature] = (await service.sign(claims)).split('.');
    const tampered = Buffer.from(
      JSON.stringify({ ...claims, tenantToolId: 'tool-ajena', aud: 'tools-oauth-state', jti: 'x' }),
    ).toString('base64url');
    await expect(service.consume(`${header}.${tampered}.${signature}`)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza un state caducado', async () => {
    const expired = await jwt.signAsync(
      { ...claims, exp: Math.floor(Date.now() / 1000) - 60 },
      { secret: SECRET, audience: 'tools-oauth-state', jwtid: 'x' },
    );
    await expect(service.consume(expired)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(dedup.claim).not.toHaveBeenCalled();
  });

  it('rechaza el segundo uso del mismo state', async () => {
    const state = await service.sign(claims);
    dedup.claim.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await service.consume(state);
    await expect(service.consume(state)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('falla cerrado sin OAUTH_STATE_SECRET', async () => {
    config.get.mockReturnValue(undefined);
    await expect(service.sign(claims)).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
