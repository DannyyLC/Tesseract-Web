import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { AnnouncementsService } from './announcements.service';
import { PrismaService } from '@/platform/database/prisma.service';

const ACTOR = { sub: 'admin-1', email: 'admin@platform.com', name: 'Admin', role: 'SUPER_ADMIN', organizationId: 'platform-org' };

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      organization: { findUnique: jest.fn(), findMany: jest.fn() },
      notification: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        count: jest.fn(),
      },
      announcementTargetOrganization: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn(), count: jest.fn() },
      userNotification: { createMany: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnouncementsService,
        { provide: PrismaService, useValue: prisma },
        { provide: WINSTON_MODULE_PROVIDER, useValue: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } },
      ],
    }).compile();

    service = module.get(AnnouncementsService);
  });

  describe('fanOut', () => {
    const baseNotification = {
      id: 'ann-1',
      targetRoles: ['OWNER', 'ADMIN'],
      titleTemplate: 'Hola',
      messageTemplate: 'Cuerpo',
      titleTemplateEn: null,
      messageTemplateEn: null,
    };

    it('excludes the platform org and inactive/deleted users on an all-orgs broadcast', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });
      prisma.notification.findUniqueOrThrow.mockResolvedValue(baseNotification);
      prisma.announcementTargetOrganization.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValueOnce([]).mockResolvedValue([]);

      await service.fanOut('ann-1');

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            deletedAt: null,
            organization: expect.objectContaining({
              isActive: true,
              deletedAt: null,
              slug: { not: 'platform' },
            }),
          }),
        }),
      );
    });

    it('does not exclude the platform org when it is one of the explicit targets', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });
      prisma.notification.findUniqueOrThrow.mockResolvedValue(baseNotification);
      prisma.announcementTargetOrganization.findMany.mockResolvedValue([
        { organizationId: 'platform-org-id' },
      ]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.fanOut('ann-1');

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organization: expect.objectContaining({ id: { in: ['platform-org-id'] } }),
          }),
        }),
      );
      const call = prisma.user.findMany.mock.calls[0][0];
      expect(call.where.organization.slug).toBeUndefined();
    });

    it('targets every organization in the list when several are selected', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });
      prisma.notification.findUniqueOrThrow.mockResolvedValue(baseNotification);
      prisma.announcementTargetOrganization.findMany.mockResolvedValue([
        { organizationId: 'org-a' },
        { organizationId: 'org-b' },
      ]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.fanOut('ann-1');

      const call = prisma.user.findMany.mock.calls[0][0];
      expect(call.where.organization.id).toEqual({ in: ['org-a', 'org-b'] });
    });

    it('stamps each row with the delivered user own organizationId, not a shared one', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });
      prisma.notification.findUniqueOrThrow.mockResolvedValue(baseNotification);
      prisma.user.findMany
        .mockResolvedValueOnce([
          { id: 'u-1', organizationId: 'org-a' },
          { id: 'u-2', organizationId: 'org-b' },
        ])
        .mockResolvedValueOnce([]);

      await service.fanOut('ann-1');

      expect(prisma.userNotification.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ userId: 'u-1', organizationId: 'org-a' }),
          expect.objectContaining({ userId: 'u-2', organizationId: 'org-b' }),
        ],
      });
    });

    it('chunks a large audience into batches of 1000 and updates deliveredCount', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });
      prisma.notification.findUniqueOrThrow.mockResolvedValue(baseNotification);

      const makeBatch = (n: number, offset: number) =>
        Array.from({ length: n }, (_, i) => ({ id: `u-${offset + i}`, organizationId: 'org-a' }));

      prisma.user.findMany
        .mockResolvedValueOnce(makeBatch(1000, 0))
        .mockResolvedValueOnce(makeBatch(1000, 1000))
        .mockResolvedValueOnce(makeBatch(500, 2000));

      const result = await service.fanOut('ann-1');

      expect(prisma.userNotification.createMany).toHaveBeenCalledTimes(3);
      expect(result.delivered).toBe(2500);
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'ann-1' },
        data: { deliveredCount: 2500 },
      });
    });

    it('throws ConflictException and never fans out twice when the claim fails', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.fanOut('ann-1')).rejects.toThrow(ConflictException);
      expect(prisma.userNotification.createMany).not.toHaveBeenCalled();
    });

    it('rethrows when createMany fails, unlike the silent-catch UtilityService method', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });
      prisma.notification.findUniqueOrThrow.mockResolvedValue(baseNotification);
      prisma.user.findMany.mockResolvedValue([{ id: 'u-1', organizationId: 'org-a' }]);
      prisma.userNotification.createMany.mockRejectedValue(new Error('db down'));

      await expect(service.fanOut('ann-1')).rejects.toThrow('db down');
    });

    it('never includes SUPER_ADMIN among the roles it can notify (DTO-level, sanity check on stored roles)', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });
      prisma.notification.findUniqueOrThrow.mockResolvedValue({
        ...baseNotification,
        targetRoles: ['OWNER', 'ADMIN', 'VIEWER'],
      });
      prisma.user.findMany.mockResolvedValue([]);

      await service.fanOut('ann-1');

      const call = prisma.user.findMany.mock.calls[0][0];
      expect(call.where.role.in).not.toContain('SUPER_ADMIN');
    });
  });

  describe('unpublish', () => {
    it('deactivates the announcement and soft-deletes its delivered rows', async () => {
      prisma.notification.findFirst.mockResolvedValue({ id: 'ann-1', kind: 'ANNOUNCEMENT' });

      await service.unpublish('ann-1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'ann-1' },
        data: { isActive: false },
      });
      expect(prisma.userNotification.updateMany).toHaveBeenCalledWith({
        where: { notificationId: 'ann-1', deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('throws NotFoundException for an id that is not an announcement', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);
      await expect(service.unpublish('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMetrics / getById', () => {
    it('returns all-zero metrics for an announcement with no delivered rows', async () => {
      prisma.notification.findFirst.mockResolvedValue({
        id: 'ann-1',
        kind: 'ANNOUNCEMENT',
        titleTemplate: 'T',
        messageTemplate: 'M',
        titleTemplateEn: null,
        messageTemplateEn: null,
        announcementTemplate: 'NEWS',
        ctaLabel: null,
        ctaLabelEn: null,
        ctaUrl: null,
        targetOrganizations: [],
        targetRoles: ['OWNER'],
        isActive: true,
        publishedAt: null,
        expiresAt: null,
        fannedOutAt: null,
        deliveredCount: 0,
        createdByEmail: 'a@b.com',
        createdAt: new Date(),
      });
      prisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getById('ann-1');

      expect(result.metrics).toEqual({ delivered: 0, dismissed: 0, ctaClicked: 0, read: 0 });
      expect(result.status).toBe('DRAFT');
    });
  });

  describe('create', () => {
    it('rejects when some target organization does not exist', async () => {
      prisma.organization.findMany.mockResolvedValue([{ id: 'org-a' }]);

      await expect(
        service.create(
          {
            title: 'Hola',
            message: 'Cuerpo',
            template: 'NEWS' as any,
            targetOrganizationIds: ['org-a', 'missing-org'],
            targetRoles: ['OWNER'] as any,
            publishNow: false,
          },
          ACTOR as any,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('creates with a nested write for each selected organization', async () => {
      prisma.organization.findMany.mockResolvedValue([{ id: 'org-a' }, { id: 'org-b' }]);
      prisma.notification.create.mockResolvedValue({ id: 'ann-1' });
      jest.spyOn(service, 'getById').mockResolvedValue({} as any);

      await service.create(
        {
          title: 'Hola',
          message: 'Cuerpo',
          template: 'NEWS' as any,
          targetOrganizationIds: ['org-a', 'org-b'],
          targetRoles: ['OWNER'] as any,
          publishNow: false,
        },
        ACTOR,
      );

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            targetOrganizations: {
              create: [{ organizationId: 'org-a' }, { organizationId: 'org-b' }],
            },
          }),
        }),
      );
    });
  });

  describe('update', () => {
    it('rejects editing title/message once the announcement has been fanned out', async () => {
      prisma.notification.findFirst.mockResolvedValue({
        id: 'ann-1',
        kind: 'ANNOUNCEMENT',
        fannedOutAt: new Date(),
      });

      await expect(service.update('ann-1', { title: 'Nuevo título' } as any)).rejects.toThrow(
        ConflictException,
      );
    });

    it('still allows editing ctaUrl after the announcement has been fanned out', async () => {
      prisma.notification.findFirst.mockResolvedValue({
        id: 'ann-1',
        kind: 'ANNOUNCEMENT',
        fannedOutAt: new Date(),
      });
      prisma.notification.update.mockResolvedValue({});
      jest.spyOn(service, 'getById').mockResolvedValue({} as any);

      await service.update('ann-1', { ctaUrl: '/billing' });

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'ann-1' },
        data: { ctaUrl: '/billing' },
      });
    });
  });
});
