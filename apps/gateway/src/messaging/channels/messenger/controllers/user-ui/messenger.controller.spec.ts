import { HttpStatus } from '@nestjs/common';
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
  const ownConfig = { id: 'ms-1', organizationId: ORG };
  const foreignConfig = { id: 'ms-9', organizationId: 'org-9' };

  const service: any = {
    getMessengerConfigById: jest.fn(async (id: string) =>
      id === ownConfig.id ? ownConfig : id === foreignConfig.id ? foreignConfig : null,
    ),
    getMessengerConfigByPageId: jest.fn().mockResolvedValue(null),
    createRecord: jest.fn().mockResolvedValue(true),
    deleteRecord: jest.fn().mockResolvedValue(true),
    updateIsActive: jest.fn().mockResolvedValue(true),
    updatePageAccessToken: jest.fn().mockResolvedValue(true),
    updateAppSecret: jest.fn().mockResolvedValue(true),
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
      { workflowId: 'wf-ajeno', pageId: 'p-1', pageName: 'x' } as any,
      r,
    );
    expect(workflowsService.getRoutingState).toHaveBeenCalledWith(ORG, 'wf-ajeno');
    expect(r.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(service.createRecord).not.toHaveBeenCalled();
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
