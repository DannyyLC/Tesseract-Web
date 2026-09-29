import { BadRequestException, HttpStatus } from '@nestjs/common';
import { UserRole } from '@tesseract/types';
import { ROLES_KEY } from '@/identity/auth/decorators/roles.decorator';
import { MessengerController } from './messenger.controller';

/**
 * Las rutas de gestión reciben el id de la config en la URL. Una página de otra organización
 * tiene que contestarse como inexistente y no llegar al servicio: el app secret es lo que
 * valida la firma del webhook, así que sobrescribirlo equivale a poder forjar mensajes.
 */
describe('MessengerController · gestión', () => {
  const ORG = 'org-1';
  const currUser: any = { organizationId: ORG, role: UserRole.ADMIN };
  const ownConfig = { id: 'ms-1', organizationId: ORG, pageId: 'p-1' };
  const foreignConfig = { id: 'ms-9', organizationId: 'org-9' };

  const service: any = {
    getMessengerConfigById: jest.fn((id: string) =>
      Promise.resolve(
        id === ownConfig.id ? ownConfig : id === foreignConfig.id ? foreignConfig : null,
      ),
    ),
    getMessengerConfigByPageId: jest.fn().mockResolvedValue(null),
    createRecord: jest.fn().mockResolvedValue(true),
    deleteRecord: jest.fn().mockResolvedValue(true),
    updateIsActive: jest.fn().mockResolvedValue(true),
    updatePageAccessToken: jest.fn().mockResolvedValue(true),
    updateAppSecret: jest.fn().mockResolvedValue(true),
    updateConfig: jest.fn().mockResolvedValue(true),
    assertCredentialsOwnPage: jest.fn().mockResolvedValue(undefined),
  };
  const workflowsService: any = { getRoutingState: jest.fn() };
  const controller = new MessengerController(
    service,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    workflowsService,
    {} as any,
    {} as any,
  );
  const res = () => {
    const r: any = {};
    r.status = jest.fn().mockReturnValue(r);
    r.json = jest.fn().mockReturnValue(r);
    return r;
  };

  beforeEach(() => jest.clearAllMocks());

  it('no toca credenciales, estado ni existencia de una página ajena', async () => {
    const responses = [res(), res(), res(), res()];
    await controller.updateAppSecret(currUser, foreignConfig.id, { appSecret: 's' }, responses[0]);
    await controller.updatePageAccessToken(
      currUser,
      foreignConfig.id,
      { pageAccessToken: 't' },
      responses[1],
    );
    await controller.setIsActive(currUser, foreignConfig.id, false, responses[2]);
    await controller.deleteConfig(currUser, foreignConfig.id, responses[3]);

    for (const r of responses) expect(r.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(service.updateAppSecret).not.toHaveBeenCalled();
    expect(service.updatePageAccessToken).not.toHaveBeenCalled();
    expect(service.updateIsActive).not.toHaveBeenCalled();
    expect(service.deleteRecord).not.toHaveBeenCalled();
  });

  it('rota el app secret de una página propia', async () => {
    const r = res();
    await controller.updateAppSecret(currUser, ownConfig.id, { appSecret: 's' }, r);
    expect(service.updateAppSecret).toHaveBeenCalledWith(ownConfig.id, 's');
    expect(r.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  it('no da de alta una página colgada de un workflow de otra organización', async () => {
    workflowsService.getRoutingState.mockResolvedValue(null);
    const r = res();
    await controller.createConfig(
      currUser,
      {
        workflowId: 'wf-ajeno',
        pageId: 'p-1',
        pageName: 'x',
        pageAccessToken: 't',
        appSecret: 's',
      },
      r,
    );
    expect(workflowsService.getRoutingState).toHaveBeenCalledWith(ORG, 'wf-ajeno');
    expect(r.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(service.createRecord).not.toHaveBeenCalled();
  });

  describe('prueba de propiedad de la página', () => {
    const rejected = () =>
      service.assertCredentialsOwnPage.mockRejectedValueOnce(
        new BadRequestException('El Page Access Token no pertenece a la página p-ajena'),
      );

    it('no da de alta una página si Meta no confirma que el token es de ella', async () => {
      rejected();
      const r = res();
      await controller.createConfig(
        currUser,
        { workflowId: 'wf-1', pageId: 'p-ajena', pageAccessToken: 't', appSecret: 's' },
        r,
      );
      expect(r.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(r.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'El Page Access Token no pertenece a la página p-ajena',
        }),
      );
      expect(service.createRecord).not.toHaveBeenCalled();
    });

    it('cambiar el pageId de una página propia vuelve a exigir la prueba', async () => {
      rejected();
      const r = res();
      await controller.updateConfig(currUser, ownConfig.id, { pageId: 'p-ajena' }, r);

      expect(service.assertCredentialsOwnPage).toHaveBeenCalledWith(
        { pageId: 'p-ajena', pageAccessToken: undefined, appSecret: undefined },
        ownConfig,
      );
      expect(r.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.updateConfig).not.toHaveBeenCalled();
    });

    it('editar solo el nombre no llama a Meta', async () => {
      await controller.updateConfig(currUser, ownConfig.id, { pageName: 'Nuevo' }, res());
      expect(service.assertCredentialsOwnPage).not.toHaveBeenCalled();
      expect(service.updateConfig).toHaveBeenCalled();
    });

    it('rotar el token verifica el nuevo contra la página guardada', async () => {
      await controller.updatePageAccessToken(
        currUser,
        ownConfig.id,
        { pageAccessToken: 'nuevo' },
        res(),
      );
      expect(service.assertCredentialsOwnPage).toHaveBeenCalledWith(
        { pageId: 'p-1', pageAccessToken: 'nuevo' },
        ownConfig,
      );
    });
  });

  // Un VIEWER solo consulta: las escrituras exigen OWNER/ADMIN.
  it.each([
    'createConfig',
    'deleteConfig',
    'updateConfig',
    'setIsActive',
    'updatePageAccessToken',
    'updateAppSecret',
  ])('%s queda fuera de VIEWER', (handler) => {
    const roles = Reflect.getMetadata(ROLES_KEY, (MessengerController.prototype as any)[handler]);
    expect(roles).toEqual([UserRole.OWNER, UserRole.ADMIN]);
  });

  it('el listado admite VIEWER', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      MessengerController.prototype.listConfigsByOrgAndWorkflow,
    );
    expect(roles).toContain(UserRole.VIEWER);
  });
});
