import { Test, TestingModule } from '@nestjs/testing';
import { CronJobsService } from './cron-jobs.service';
import { PrismaService } from './database/prisma.service';

describe('CronJobsService', () => {
  let service: CronJobsService;

  const mockPrismaService = {
    userVerification: {
      deleteMany: jest.fn(),
    },
    conversation: {
      updateMany: jest.fn(),
    },
    refreshToken: {
      deleteMany: jest.fn(),
    },
    userNotification: {
      updateMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronJobsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CronJobsService>(CronJobsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleCleanup (userVerification)', () => {
    it('should delete expired user verifications', async () => {
      mockPrismaService.userVerification.deleteMany.mockResolvedValue({ count: 5 });
      await service.handleCleanup();
      expect(mockPrismaService.userVerification.deleteMany).toHaveBeenCalled();
    });
  });

  describe('handleConversationCleanup', () => {
    it('should auto-close inactive conversations', async () => {
      mockPrismaService.conversation.updateMany.mockResolvedValue({ count: 2 });
      await service.handleConversationCleanup();
      expect(mockPrismaService.conversation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'closed', closedAt: expect.any(Date) },
        })
      );
    });
  });

  describe('handleRefreshTokenCleanup', () => {
    it('should delete expired/revoked refresh tokens', async () => {
      mockPrismaService.refreshToken.deleteMany.mockResolvedValue({ count: 10 });
      await service.handleRefreshTokenCleanup();
      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalled();
    });
  });

  describe('handleNotificationCleanup', () => {
    it('should auto-soft-delete read notifications', async () => {
      mockPrismaService.userNotification.updateMany.mockResolvedValue({ count: 3 });
      await service.handleNotificationCleanup();
      expect(mockPrismaService.userNotification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { deletedAt: expect.any(Date) },
          where: expect.objectContaining({ isRead: true })
        })
      );
    });
  });
});
