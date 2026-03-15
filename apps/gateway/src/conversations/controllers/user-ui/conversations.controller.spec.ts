import { Test, TestingModule } from '@nestjs/testing';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from '../../conversations.service';
import { NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { UpdateConversationDto } from '../../dto';
import { UserPayload } from '../../../common/types/jwt-payload.type';
import { UserRole } from '@tesseract/types';

const mockConversationsService = {
  findAll: jest.fn(),
  getStats: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('ConversationsController', () => {
  let controller: ConversationsController;

  const mockUser: UserPayload = {
    sub: 'u-1',
    name: 'Test User',
    organizationId: 'org-1',
    role: UserRole.OWNER,
    email: 'test@example.com',
  };

  const mockResponse = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConversationsController],
      providers: [
        { provide: ConversationsService, useValue: mockConversationsService },
      ],
    }).compile();

    controller = module.get<ConversationsController>(ConversationsController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getDashboardData', () => {
    it('should return dashboard data', async () => {
      const mockResult = {
        items: [{ id: 'c-1', userId: 'u-1' }],
        nextCursor: null,
        prevCursor: null,
        pageSize: 10,
        nextPageAvailable: false,
      };
      mockConversationsService.findAll.mockResolvedValue(mockResult);
      const res = mockResponse();

      await controller.getDashboardData(
        mockUser,
        null,
        10,
        null,
        undefined,
        undefined,
        res,
      );

      expect(mockConversationsService.findAll).toHaveBeenCalledWith({
        organizationId: 'org-1',
        cursor: null,
        take: 10,
        paginationAction: null,
        workflowId: undefined,
        userId: undefined,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return stats', async () => {
      const stats = {
        totalConversations: 10,
        activeConversations: 5,
        totalMessagesMonth: 100,
      };
      mockConversationsService.getStats.mockResolvedValue(stats);
      const res = mockResponse();

      await controller.getStats(mockUser, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: stats,
        }),
      );
    });
  });

  describe('getById', () => {
    it('should return conversation detail', async () => {
      const mockConversation = { id: 'c-1', messages: [] };
      mockConversationsService.findOne.mockResolvedValue(mockConversation);
      const res = mockResponse();

      await controller.getById(mockUser, 'c-1', res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalled();
    });

    it('should throw NotFoundException if not found', async () => {
      mockConversationsService.findOne.mockResolvedValue(null);
      const res = mockResponse();

      await expect(controller.getById(mockUser, 'c-1', res)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update and return conversation', async () => {
      const mockConversation = { id: 'c-1' };
      mockConversationsService.update.mockResolvedValue(mockConversation);
      const res = mockResponse();

      const dto: UpdateConversationDto = { status: 'closed' };

      await controller.update(mockUser, 'c-1', dto, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete conversation', async () => {
      mockConversationsService.remove.mockResolvedValue(undefined);
      const res = mockResponse();

      await controller.remove(mockUser, 'c-1', res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalled();
    });
  });
});
