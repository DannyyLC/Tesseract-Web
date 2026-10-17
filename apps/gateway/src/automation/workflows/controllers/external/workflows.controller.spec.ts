import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ExternalWorkflowsController } from './workflows.controller';

/** Una key creada para un workflow solo ejecuta ese workflow. */
describe('ExternalWorkflowsController', () => {
  const workflowsService = {
    execute: jest.fn().mockResolvedValue({ result: { messages: [] } }),
    executeStream: jest.fn().mockResolvedValue({}),
  };
  const controller = new ExternalWorkflowsController(workflowsService as any);
  const key = (workflowId: string | null) =>
    ({ apiKeyId: 'key-1', organizationId: 'org-1', workflowId }) as any;
  const body = { input: { message: 'hola' } } as any;

  beforeEach(() => jest.clearAllMocks());

  it('ejecuta el workflow de la key', async () => {
    await controller.execute(key('wf-1'), 'wf-1', body);
    expect(workflowsService.execute).toHaveBeenCalledWith(
      'org-1',
      'wf-1',
      body.input,
      undefined,
      undefined,
      undefined,
      'key-1',
      expect.anything(),
    );
  });

  it("resuelve 'current' al workflow de la key", async () => {
    await controller.execute(key('wf-1'), 'current', body);
    expect(workflowsService.execute.mock.calls[0][1]).toBe('wf-1');
  });

  it('rechaza otro workflow de la misma organización', async () => {
    await expect(controller.execute(key('wf-1'), 'wf-2', body)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.executeStream(key('wf-1'), 'wf-2', body)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(workflowsService.execute).not.toHaveBeenCalled();
    expect(workflowsService.executeStream).not.toHaveBeenCalled();
  });

  it('una key sin workflow vale para toda la organización', async () => {
    await controller.execute(key(null), 'wf-2', body);
    expect(workflowsService.execute.mock.calls[0][1]).toBe('wf-2');
  });

  it("una key sin workflow no puede usar 'current'", async () => {
    await expect(controller.execute(key(null), 'current', body)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
