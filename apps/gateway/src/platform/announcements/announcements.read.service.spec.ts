import { Test, TestingModule } from '@nestjs/testing';
import { AnnouncementsReadService } from './announcements.read.service';
import { PrismaService } from '@/platform/database/prisma.service';

describe('AnnouncementsReadService', () => {
  let service: AnnouncementsReadService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      userNotification: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AnnouncementsReadService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AnnouncementsReadService);
  });

  describe('getPending', () => {
    it('filters by dismissed, soft-deleted, inactive and expired, and caps at 3', async () => {
      await service.getPending('user-1', 'org-1', 'es');

      expect(prisma.userNotification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            organizationId: 'org-1',
            deletedAt: null,
            dismissedAt: null,
            notification: expect.objectContaining({
              kind: 'ANNOUNCEMENT',
              isActive: true,
              OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
            }),
          }),
          take: 3,
        }),
      );
    });

    it('falls back to Spanish content when English is requested but not set', async () => {
      prisma.userNotification.findMany.mockResolvedValue([
        {
          id: 'un-1',
          titleSnapshot: 'Hola',
          messageSnapshot: 'Cuerpo',
          titleSnapshotEn: null,
          messageSnapshotEn: null,
          createdAt: new Date('2026-01-01'),
          notification: { announcementTemplate: 'NEWS', ctaLabel: null, ctaLabelEn: null, ctaUrl: null },
        },
      ]);

      const [result] = await service.getPending('user-1', 'org-1', 'en');

      expect(result.title).toBe('Hola');
      expect(result.message).toBe('Cuerpo');
    });

    it('uses English content when present and requested', async () => {
      prisma.userNotification.findMany.mockResolvedValue([
        {
          id: 'un-1',
          titleSnapshot: 'Hola',
          messageSnapshot: 'Cuerpo',
          titleSnapshotEn: 'Hello',
          messageSnapshotEn: 'Body',
          createdAt: new Date('2026-01-01'),
          notification: { announcementTemplate: 'NEWS', ctaLabel: null, ctaLabelEn: null, ctaUrl: null },
        },
      ]);

      const [result] = await service.getPending('user-1', 'org-1', 'en');

      expect(result.title).toBe('Hello');
      expect(result.message).toBe('Body');
    });
  });

  describe('dismiss', () => {
    it('sets dismissedAt and isRead, scoped to the calling user and org', async () => {
      await service.dismiss('un-1', 'user-1', 'org-1');

      expect(prisma.userNotification.updateMany).toHaveBeenCalledWith({
        where: { id: 'un-1', userId: 'user-1', organizationId: 'org-1' },
        data: { dismissedAt: expect.any(Date), isRead: true },
      });
    });
  });

  describe('registerCtaClick', () => {
    it('only writes when ctaClickedAt is still null', async () => {
      await service.registerCtaClick('un-1', 'user-1', 'org-1');

      expect(prisma.userNotification.updateMany).toHaveBeenCalledWith({
        where: { id: 'un-1', userId: 'user-1', organizationId: 'org-1', ctaClickedAt: null },
        data: { ctaClickedAt: expect.any(Date) },
      });
    });
  });
});
