import { InviteUserErrorsDto } from '../users/dto/invite-user-errors.dto';
import { OrganizationsService } from './organizations.service';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common'
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { EmailService } from '@/notifications/email/email.service';
import { UtilityService } from '@/utility/utility.service';

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


describe('OrganizationsService', () => {
  let service: OrganizationsService;

  const mockPrismaService: any = {
    organization: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    user: {
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    subscription: {
      findFirst: jest.fn(),
    },
    execution: {
      count: jest.fn(),
    },
    userVerification: {
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  };

  const mockEmailService = {
    sendTemplateEmail: jest.fn(),
    sendServiceRequestEmail: jest.fn(),
  };

  const mockUtilityService = {
    sendNotificationToAppClients: jest.fn(),
  };


  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: WINSTON_MODULE_PROVIDER, useValue: mockLogger },
        { provide: EmailService, useValue: mockEmailService },
        { provide: UtilityService, useValue: mockUtilityService }]
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
    jest.clearAllMocks();
    
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('returns organization when found', async () => {
      const org = { id: 'org-1', name: 'Org', plan: 'FREE', _count: { users: 5, workflows: 2, apiKeys: 1 } };
      mockPrismaService.organization.findUnique.mockResolvedValue(org);
      const res = await service.findOne('org-1');
      expect(res.name).toEqual('Org');
      expect(res.usage.users).toEqual(5);
      expect(mockPrismaService.organization.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'org-1' }, include: expect.any(Object) }),
      );
    });

    it('throws NotFoundException when not found', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue(null);
      await expect(service.findOne('org-x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates an organization', async () => {
      const payload = { name: 'New Org', subdomain: 'new' };
      // generateUniqueSlug checks for existing slug via findUnique; ensure it returns null
      mockPrismaService.organization.findUnique.mockResolvedValue(null);
      mockPrismaService.organization.create.mockResolvedValue({ id: 'org-new', ...payload });
      const res = await service.create(payload as any);
      expect(res).toEqual(expect.objectContaining({ id: 'org-new', name: 'New Org' }));
      expect(mockPrismaService.organization.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates organization', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue({ id: 'org-1' });
      mockPrismaService.organization.update.mockResolvedValue({ id: 'org-1', name: 'Updated' });
      const res = await service.update('org-1', { name: 'Updated' } as any);
      expect(res).toEqual({ id: 'org-1', name: 'Updated' });
      expect(mockPrismaService.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: expect.objectContaining({ name: 'Updated' }),
      });
    });

    it('returns null when updating missing org', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue(null);
      const res = await service.update('org-x', { name: 'x' } as any);
      expect(res).toBeNull();
    });
  });

  describe('remove (soft-delete)', () => {
    it('soft deletes organization', async () => {
      // softDelete requires user context and confirmation text
      const user = { id: 'user-1', organizationId: 'org-1', organization: { name: 'Org' }, role: 'OWNER', twoFactorEnabled: false };
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.organization.findUnique.mockResolvedValue({ id: 'org-1', deletedAt: null });
      mockPrismaService.organization.update.mockResolvedValue({ id: 'org-1', deletedAt: new Date(), isActive: false });
      await service.softDelete('org-1', 'user-1', 'Org');
      expect(mockPrismaService.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date), isActive: false }),
      });
    });
  });

  describe('getStats', () => {
    it('returns basic stats shape', async () => {
      // service.getStats expects organization.findUnique to return counts and plan
      mockPrismaService.organization.findUnique.mockResolvedValue({ plan: 'FREE', _count: { users: 2, workflows: 1, apiKeys: 0 } });
      mockPrismaService.execution.count.mockResolvedValue(7);
      const stats = await service.getStats('org-1');
      expect(stats.usage.users.current).toBe(2);
      expect(stats.usage.executions.thisMonth).toBe(7);
    });
  });
});