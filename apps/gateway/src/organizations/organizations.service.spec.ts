import { InviteUserErrorsDto } from '../users/dto/invite-user-errors.dto';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService invite', () => {
  const organizationId = 'org-1';
  const email = 'owner@fractal.com';

  const createService = () => {
    const prisma = {
      organization: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: organizationId, name: 'Fractal', isActive: true, deletedAt: null, deactivatedAt: null })
          .mockResolvedValueOnce({ id: organizationId, plan: 'FREE', customMaxUsers: null, subscription: null }),
      },
      user: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
      },
      userVerification: {
        findFirst: jest.fn(),
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
    };

    const emailService = {
      sendOrganizationExistsEmail: jest.fn(),
      sendOrganizationInvitationToEmail: jest.fn(),
    };

    const logger = {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    const utilityService = {
      sendNotificationToAppClients: jest.fn(),
    };

    const service = new OrganizationsService(
      prisma as any,
      logger as any,
      emailService as any,
      utilityService as any,
    );

    return {
      service,
      prisma,
      emailService,
    };
  };

  it('returns USER_ALREADY_REGISTERED when user already belongs to the same organization', async () => {
    const { service, prisma, emailService } = createService();

    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email,
      organizationId,
      deletedAt: null,
    });

    const result = await service.invite(organizationId, email);

    expect(result).toBe(InviteUserErrorsDto.USER_ALREADY_REGISTERED);
    expect(emailService.sendOrganizationExistsEmail).not.toHaveBeenCalled();
    expect(emailService.sendOrganizationInvitationToEmail).not.toHaveBeenCalled();
  });

  it('sends organization-exists email when user belongs to another organization', async () => {
    const { service, prisma, emailService } = createService();

    prisma.user.findUnique.mockResolvedValue({
      id: 'user-2',
      email,
      organizationId: 'org-2',
      deletedAt: null,
    });

    const result = await service.invite(organizationId, email);

    expect(result).toBe(true);
    expect(emailService.sendOrganizationExistsEmail).toHaveBeenCalledWith(email, 'Fractal');
    expect(emailService.sendOrganizationInvitationToEmail).not.toHaveBeenCalled();
  });
});
