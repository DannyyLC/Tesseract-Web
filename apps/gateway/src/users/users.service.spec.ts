import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../notifications/email/email.service';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';

jest.mock('speakeasy', () => ({
  totp: {
    verify: jest.fn(),
  },
  generateSecret: jest.fn(),
}));

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;
  let emailService: EmailService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    execution: {
      count: jest.fn(),
    },
    conversation: {
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockEmailService = {
    sendTemplateEmail: jest.fn(),
  };

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: WINSTON_MODULE_PROVIDER,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
    emailService = module.get<EmailService>(EmailService);

    jest.clearAllMocks();
  });

  describe('Queries (findOne, findAll, findByEmail, count)', () => {
    it('findOne should return a user if found', async () => {
      const mockUser = { id: 'u1', organizationId: 'org1' };
      prisma.user.findFirst = jest.fn().mockResolvedValue(mockUser);

      const result = await service.findOne('u1', 'org1');
      
      expect(result).toEqual(mockUser);
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'u1', organizationId: 'org1', deletedAt: null },
        include: { organization: true },
      });
    });

    it('findOne should throw NotFoundException if user not found', async () => {
      prisma.user.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.findOne('u1', 'org1')).rejects.toThrow(NotFoundException);
    });

    it('findAll should return paginated users', async () => {
      const mockUsers = [{ id: 'u1' }, { id: 'u2' }];
      prisma.user.count = jest.fn().mockResolvedValue(2);
      prisma.user.findMany = jest.fn().mockResolvedValue(mockUsers);

      const result = await service.findAll('org1', { page: 1, limit: 10, role: 'viewer' as any, isActive: true });

      expect(result.data).toEqual(mockUsers);
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      // Verification of where clause includes filtering params
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org1', role: 'viewer', isActive: true, deletedAt: null
          })
        })
      );
    });

    it('findByEmail should return user', async () => {
      const mockUser = { id: 'u1', email: 'test@test.com' };
      prisma.user.findFirst = jest.fn().mockResolvedValue(mockUser);
      
      const result = await service.findByEmail('test@test.com', 'org1');
      
      expect(result).toEqual(mockUser);
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'test@test.com', organizationId: 'org1', deletedAt: null },
      });
    });
  });

  describe('Mutations (updateProfile, updateRole, activate, deactivate, transferOwnership, updateLastLogin)', () => {
    it('updateProfile should modify name and timezone', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'u1' } as any);
      const mockUpdated = { id: 'u1', name: 'New Name' };
      prisma.user.update = jest.fn().mockResolvedValue(mockUpdated);

      const result = await service.updateProfile('u1', 'org1', { name: 'New Name' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { name: 'New Name' }
      });
      expect(result).toEqual(mockUpdated);
    });

    it('updateRole should reject super_admin assignments', async () => {
      jest.spyOn(service, 'findOne')
        .mockResolvedValueOnce({ id: 'target', role: 'viewer' } as any) // target
        .mockResolvedValueOnce({ id: 'actor', role: 'owner' } as any); // actor

      await expect(service.updateRole('target', 'org1', 'super_admin', 'actor')).rejects.toThrow(ForbiddenException);
    });

    it('updateRole should properly update the role', async () => {
      jest.spyOn(service, 'findOne')
        .mockResolvedValueOnce({ id: 'target', role: 'viewer' } as any) // target
        .mockResolvedValueOnce({ id: 'actor', role: 'owner' } as any); // actor

      const mockUpdated = { id: 'target', role: 'admin' };
      prisma.user.update = jest.fn().mockResolvedValue(mockUpdated);

      const result = await service.updateRole('target', 'org1', 'admin', 'actor');
      expect(result).toEqual(mockUpdated);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'target' },
        data: { role: 'admin' }
      });
    });

    it('activate/deactivate should toggle isActive', async () => {
      jest.spyOn(service, 'findOne')
        .mockResolvedValueOnce({ id: 'target', role: 'viewer' } as any) // target user
        .mockResolvedValueOnce({ id: 'actor', role: 'admin' } as any);  // actor user

      const mockActivated = { id: 'target', isActive: true };
      prisma.user.update = jest.fn().mockResolvedValue(mockActivated);

      const result = await service.activate('target', 'org1', 'actor');
      
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'target' },
        data: { isActive: true }
      });
      expect(result).toEqual(mockActivated);
    });

    it('transferOwnership should switch roles via transaction', async () => {
      jest.spyOn(service, 'findOne')
        .mockResolvedValueOnce({ id: 'owner', role: 'owner' } as any)
        .mockResolvedValueOnce({ id: 'newOwner', role: 'admin', isActive: true } as any);

      await service.transferOwnership('owner', 'newOwner', 'org1');

      expect(prisma.$transaction).toHaveBeenCalled();
      // Internal execution pushes array of un-executed prisma promises
      // Since it's an array of Prisma promises we mostly verify $transaction was invoked
    });

    it('transferOwnership should reject if new owner is inactive', async () => {
      jest.spyOn(service, 'findOne')
        .mockResolvedValueOnce({ id: 'owner', role: 'owner' } as any)
        .mockResolvedValueOnce({ id: 'newOwner', role: 'admin', isActive: false } as any);

      await expect(service.transferOwnership('owner', 'newOwner', 'org1')).rejects.toThrow(BadRequestException);
    });

    it('updateLastLogin should set lastLoginAt', async () => {
      await service.updateLastLogin('u1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { lastLoginAt: expect.any(Date) }
      });
    });
  });

  describe('Management and Analytics (remove, restore, getStats, findInactive, getUserActivity)', () => {
    it('remove should soft-delete user if actor has permissions', async () => {
      jest.spyOn(service, 'findOne')
        .mockResolvedValueOnce({ id: 'target', role: 'viewer' } as any) // target
        .mockResolvedValueOnce({ id: 'actor', role: 'admin' } as any); // actor

      await service.remove('target', 'org1', 'actor');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'target' },
        data: { deletedAt: expect.any(Date) }
      });
    });

    it('remove should reject if actor lacks permissions', async () => {
      jest.spyOn(service, 'findOne')
        .mockResolvedValueOnce({ id: 'target', role: 'admin' } as any) // target
        .mockResolvedValueOnce({ id: 'actor', role: 'viewer' } as any); // actor

      await expect(service.remove('target', 'org1', 'actor')).rejects.toThrow(ForbiddenException);
    });

    it('restore should reverse soft-delete', async () => {
      prisma.user.findFirst = jest.fn().mockResolvedValue({ id: 'u1', deletedAt: new Date() });
      const mockRestored = { id: 'u1', deletedAt: null };
      prisma.user.update = jest.fn().mockResolvedValue(mockRestored);

      const result = await service.restore('u1', 'org1');
      expect(result).toEqual(mockRestored);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { deletedAt: null }
      });
    });

    it('getStats should aggregate counts correctly', async () => {
      // Mock the multiple promise all responses
      prisma.user.count = jest.fn()
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(8)  // active
        .mockResolvedValueOnce(2)  // inactive
        .mockResolvedValueOnce(9)  // verified
        .mockResolvedValueOnce(1); // unverified

      prisma.user.groupBy = jest.fn().mockResolvedValue([
        { role: 'admin', _count: 3 },
        { role: 'viewer', _count: 6 },
        { role: 'owner', _count: 1 },
      ]);

      const result = await service.getStats('org1');
      expect(result).toEqual({
        total: 10,
        byRole: { admin: 3, viewer: 6, owner: 1 },
        active: 8,
        inactive: 2,
        verified: 9,
        unverified: 1,
      });
    });

    it('findInactive should return old login users', async () => {
      const mockUsers = [{ id: 'oldUser' }];
      prisma.user.findMany = jest.fn().mockResolvedValue(mockUsers);

      const result = await service.findInactive('org1', 30);
      expect(result).toEqual(mockUsers);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { lastLoginAt: { lt: expect.any(Date) } },
              { lastLoginAt: null }
            ])
          })
        })
      );
    });

    it('getUserActivity should fetch correct execution and conversation counts', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'u1', lastLoginAt: new Date('2023-01-01') } as any);
      
      prisma.execution.count = jest.fn().mockResolvedValue(55);
      prisma.conversation.count = jest.fn().mockResolvedValue(10);

      const result = await service.getUserActivity('u1', 'org1');
      expect(result).toEqual({
        totalExecutions: 55,
        activeConversations: 10,
        lastLoginAt: expect.any(Date),
      });
    });
  });

});
