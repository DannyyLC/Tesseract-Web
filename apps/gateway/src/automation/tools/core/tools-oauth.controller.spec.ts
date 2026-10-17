import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@tesseract/types';
import { ROLES_KEY } from '@/identity/auth/decorators/roles.decorator';
import { ToolsOauthController } from './tools-oauth.controller';

/**
 * El callback lo llama Google, sin sesión. Lo que importa es que un state que no pasa la
 * verificación, o de alguien que ya no puede conectar, nunca llegue a canjear el code ni a
 * guardar credenciales.
 */
describe('ToolsOauthController · callback', () => {
  const claims = { tenantToolId: 'tool-1', organizationId: 'org-1', userId: 'user-1' };

  const oauthService = {
    assertCanConnect: jest.fn(),
    exchangeGoogleCode: jest.fn().mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 3600,
      scopes: [],
    }),
  };
  const toolsService = { upsertCredentials: jest.fn() };
  const config = { get: jest.fn().mockReturnValue('https://app.test') };
  const oauthState = { consume: jest.fn() };
  const controller = new ToolsOauthController(
    oauthService as any,
    toolsService as any,
    config as any,
    oauthState as any,
  );
  const res = () => ({ redirect: jest.fn() }) as any;

  beforeEach(() => jest.clearAllMocks());

  it('con un state inválido no canjea el code ni guarda nada', async () => {
    oauthState.consume.mockRejectedValue(new UnauthorizedException());
    const r = res();

    await controller.handleGoogleCallback('code', 'state-falso', undefined as any, r);

    expect(oauthService.exchangeGoogleCode).not.toHaveBeenCalled();
    expect(toolsService.upsertCredentials).not.toHaveBeenCalled();
    expect(r.redirect).toHaveBeenCalledWith(expect.stringContaining('error='));
  });

  it('si quien lo emitió ya no puede conectar, tampoco canjea', async () => {
    oauthState.consume.mockResolvedValue(claims);
    oauthService.assertCanConnect.mockRejectedValue(new ForbiddenException());

    await controller.handleGoogleCallback('code', 'state', undefined as any, res());

    expect(oauthService.exchangeGoogleCode).not.toHaveBeenCalled();
    expect(toolsService.upsertCredentials).not.toHaveBeenCalled();
  });

  it('con un state válido guarda las credenciales en la tool que dice el state', async () => {
    oauthState.consume.mockResolvedValue(claims);
    oauthService.assertCanConnect.mockResolvedValue(undefined);
    const r = res();

    await controller.handleGoogleCallback('code', 'state', undefined as any, r);

    expect(toolsService.upsertCredentials).toHaveBeenCalledWith(
      'tool-1',
      'org-1',
      'user-1',
      expect.objectContaining({ provider: 'google', accessToken: 'a' }),
    );
    expect(r.redirect).toHaveBeenCalledWith('https://app.test/tools?status=success');
  });

  it('iniciar la conexión queda fuera de VIEWER', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, ToolsOauthController.prototype.generateAuthUrl);
    expect(roles).toEqual([UserRole.OWNER, UserRole.ADMIN]);
  });
});
