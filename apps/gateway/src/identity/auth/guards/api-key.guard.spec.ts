import { UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  const organization = {
    id: 'org-1',
    name: 'Org',
    slug: 'org',
    plan: 'PRO',
    isActive: true,
    deletedAt: null,
  };
  const baseKey = {
    id: 'key-1',
    name: 'Key',
    isActive: true,
    deletedAt: null,
    expiresAt: null as Date | null,
    workflowId: 'wf-1',
    organization,
  };

  const prisma = {
    apiKey: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const guard = new ApiKeyGuard(prisma as any);

  const context = () => {
    const request: any = { headers: { 'x-api-key': 'ak_live_x' } };
    return {
      request,
      ctx: { switchToHttp: () => ({ getRequest: () => request }) } as any,
    };
  };

  beforeEach(() => jest.clearAllMocks());

  it('deja pasar una key vigente e inyecta su payload', async () => {
    prisma.apiKey.findUnique.mockResolvedValue({
      ...baseKey,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const { request, ctx } = context();

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.apiKey).toEqual(
      expect.objectContaining({ apiKeyId: 'key-1', organizationId: 'org-1', workflowId: 'wf-1' }),
    );
  });

  it('deja pasar una key sin caducidad', async () => {
    prisma.apiKey.findUnique.mockResolvedValue(baseKey);
    await expect(guard.canActivate(context().ctx)).resolves.toBe(true);
  });

  it('rechaza una key cuyo expiresAt ya pasó', async () => {
    prisma.apiKey.findUnique.mockResolvedValue({
      ...baseKey,
      expiresAt: new Date(Date.now() - 1_000),
    });
    await expect(guard.canActivate(context().ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.apiKey.update).not.toHaveBeenCalled();
  });
});
