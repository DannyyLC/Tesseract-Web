import { Test, TestingModule } from '@nestjs/testing';
import { UtilityService } from './utility.service';
import { PrismaService } from '../database/prisma.service';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

describe('UtilityService', () => {
  let service: UtilityService;
  let prismaService: any;
  let logger: any;

  const mockPrismaService = {
    user: {
      findMany: jest.fn(),
    },
    notification: {
      findFirst: jest.fn(),
    },
    userNotification: {
      createMany: jest.fn(),
    },
  };

  const mockLogger = {
    error: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UtilityService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: WINSTON_MODULE_PROVIDER, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<UtilityService>(UtilityService);
    prismaService = module.get<PrismaService>(PrismaService);
    logger = module.get(WINSTON_MODULE_PROVIDER);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('hashPassword', () => {
    it('should hash password', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_pw');
      const result = await service.hashPassword('my_pw');
      expect(result).toBe('hashed_pw');
      expect(bcrypt.hash).toHaveBeenCalledWith('my_pw', 10);
    });
  });

  describe('removeIdFromObject', () => {
    it('should remove id from object', () => {
      const result = service.removeIdFromObject({ id: 1, name: 'test' });
      expect(result).toEqual({ name: 'test' });
    });
  });

  describe('removeIdFromArray', () => {
    it('should remove id from all objects in array', () => {
      const result = service.removeIdFromArray([
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ]);
      expect(result).toEqual([{ name: 'A' }, { name: 'B' }]);
    });
  });

  describe('sendNotificationToAppClients', () => {
    it('should create notifications for users and emit subject event', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([{ id: 'u-1' }]);
      mockPrismaService.notification.findFirst.mockResolvedValue({ id: 'n-1' });

      // Valid notification code from notificationsEnum, e.g., 'TEST_WARNING' 
      // (assuming some generic property or catching mock behavior)
      const mockNext = jest.spyOn(service.getAppNotificationsSubject(), 'next');

      await service.sendNotificationToAppClients('org-1', ['admin'], '0000-0001');

      expect(mockPrismaService.userNotification.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'u-1', notificationId: 'n-1', organizationId: 'org-1', isRead: false }],
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle errors gracefully and log them', async () => {
      mockPrismaService.user.findMany.mockRejectedValue(new Error('DB Error'));

      await service.sendNotificationToAppClients('org-1', ['admin'], 'error_code');

      expect(logger.error).toHaveBeenCalledWith(
        'UtilityService - sendNotificationToAppClients >> Error sending notification to app clients:',
        expect.any(Error),
      );
    });

    it('should not create notification if no users or notification found', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);
      mockPrismaService.notification.findFirst.mockResolvedValue(null);

      await service.sendNotificationToAppClients('org-1', ['admin'], 'none');

      expect(mockPrismaService.userNotification.createMany).not.toHaveBeenCalled();
    });
  });

  describe('getAppNotificationsSubject', () => {
    it('should return the Subject', () => {
      const subject = service.getAppNotificationsSubject();
      expect(subject).toBeDefined();
    });
  });
});
