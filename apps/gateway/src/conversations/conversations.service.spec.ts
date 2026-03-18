import { Test, TestingModule } from '@nestjs/testing';
import { ConversationsService } from './conversations.service';
import { PrismaService } from '../database/prisma.service';
import { CursorPaginatedResponseUtils } from '../common/responses/cursor-paginated-response';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

// Mock CursorPaginatedResponseUtils
const mockBuild = jest.fn();
jest.spyOn(CursorPaginatedResponseUtils, 'getInstance').mockReturnValue({
  build: mockBuild,
} as unknown as CursorPaginatedResponseUtils);

// Mock PrismaService
const mockPrismaService = {
  conversation: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  workflow: {
    findUnique: jest.fn(),
  },
  message: {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
  subscription: {
    findFirst: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('ConversationsService', () => {
  let service: ConversationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ConversationsService>(ConversationsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOrCreateConversation', () => {
    it('should return existing conversation if conversationId is provided and exists', async () => {
      const mockConversation = { id: 'conv-123' };
      mockPrismaService.conversation.findUnique.mockResolvedValue(mockConversation);

      const result = await service.findOrCreateConversation(
        'wf-1',
        'api',
        undefined,
        undefined,
        'conv-123',
      );

      expect(mockPrismaService.conversation.findUnique).toHaveBeenCalledWith({
        where: { id: 'conv-123' },
      });
      expect(result).toEqual(mockConversation);
    });

    it('should throw Error if workflow not found', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValue(null);
      mockPrismaService.workflow.findUnique.mockResolvedValue(null);

      await expect(service.findOrCreateConversation('wf-1', 'api')).rejects.toThrow(
        'Workflow no encontrado: wf-1',
      );
    });

    it('should create a new conversation if no conversationId provided and workflow exists', async () => {
      mockPrismaService.workflow.findUnique.mockResolvedValue({ organizationId: 'org-1' });
      const mockNewConversation = { id: 'new-conv-1' };
      mockPrismaService.conversation.create.mockResolvedValue(mockNewConversation);

      const result = await service.findOrCreateConversation(
        'wf-1',
        'api',
        'user-1',
        'endUser-1',
      );

      expect(mockPrismaService.conversation.create).toHaveBeenCalledWith({
        data: {
          workflowId: 'wf-1',
          organizationId: 'org-1',
          channel: 'api',
          userId: 'user-1',
          endUserId: 'endUser-1',
          status: 'active',
          messageCount: 0,
          totalTokens: 0,
          totalCost: 0,
        },
      });
      expect(result).toEqual(mockNewConversation);
    });
  });

  describe('findOne', () => {
    it('should return conversation with messages', async () => {
      const mockConversation = { id: 'c-1', messages: [] };
      mockPrismaService.conversation.findFirst.mockResolvedValue(mockConversation);

      const result = await service.findOne('org-1', 'c-1');
      expect(mockPrismaService.conversation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c-1', organizationId: 'org-1', deletedAt: null },
        }),
      );
      expect(result).toEqual(mockConversation);
    });

    it('should throw NotFoundException if conversation not found', async () => {
      mockPrismaService.conversation.findFirst.mockResolvedValue(null);

      await expect(service.findOne('org-1', 'c-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update conversation if ownership verified and no forbidden HITL update', async () => {
      mockPrismaService.conversation.findFirst.mockResolvedValue({ id: 'c-1' });
      mockPrismaService.conversation.findUnique.mockResolvedValue({ userId: null });
      mockPrismaService.conversation.update.mockResolvedValue({ id: 'c-1', status: 'closed' });

      const result = await service.update('org-1', 'c-1', {
        status: 'closed',
        isHumanInTheLoop: true,
      });
      expect(result).toEqual({ id: 'c-1', status: 'closed' });
      expect(mockPrismaService.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { status: 'closed', isHumanInTheLoop: true },
      });
    });

    it('should throw ForbiddenException if internal user tries to toggle HITL', async () => {
      mockPrismaService.conversation.findFirst.mockResolvedValue({ id: 'c-1' });
      mockPrismaService.conversation.findUnique.mockResolvedValue({ userId: 'u-1' });

      await expect(
        service.update('org-1', 'c-1', { isHumanInTheLoop: true }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('should return paginated conversations', async () => {
      const mockConversations = [{ id: 'c-1', userId: 'u-1' }];
      mockPrismaService.conversation.findMany.mockResolvedValue(mockConversations);
      mockBuild.mockReturnValue({ items: mockConversations, nextCursor: null });

      const result = await service.findAll({
        paginationAction: 'next',
        organizationId: 'org-1',
        take: 10,
      });

      expect(mockBuild).toHaveBeenCalled();
      expect(result.items[0].isInternal).toBe(true);
    });
  });

  describe('getMessageHistory', () => {
    it('should return messages', async () => {
      const mockMessages = [{ role: 'user', content: 'hello', attachments: [] }];
      mockPrismaService.message.findMany.mockResolvedValue(mockMessages);

      const result = await service.getMessageHistory('c-1');
      expect(result).toEqual([{ role: 'user', content: 'hello' }]);
      expect(mockPrismaService.message.findMany).toHaveBeenCalledWith({
        where: { conversationId: 'c-1' },
        orderBy: { createdAt: 'asc' },
        select: {
          role: true,
          content: true,
          attachments: {
            select: {
              type: true,
              processingStatus: true,
              processedText: true,
            },
          },
        },
      });
    });

    it('should append processed media text to message content', async () => {
      mockPrismaService.message.findMany.mockResolvedValue([
        {
          role: 'user',
          content: 'audio message',
          attachments: [
            {
              type: 'AUDIO',
              processingStatus: 'PROCESSED',
              processedText: 'Quiero agendar una demo',
            },
          ],
        },
      ]);

      const result = await service.getMessageHistory('c-1');

      expect(result).toEqual([
        {
          role: 'user',
          content: 'audio message\n\n[audio] Quiero agendar una demo',
        },
      ]);
    });
  });

  describe('addMessage', () => {
    it('should create message and update conversation in transaction', async () => {
      const mockMessage = { id: 'm-1' };
      mockPrismaService.$transaction.mockResolvedValue([mockMessage, {}]);

      const result = await service.addMessage('conv-1', 'USER', 'Hello');
      expect(result).toEqual(mockMessage);
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });
  });

  describe('count', () => {
    it('should count conversations', async () => {
      mockPrismaService.conversation.count.mockResolvedValue(5);
      const result = await service.count({ organizationId: 'org-1' });
      expect(result).toBe(5);
    });
  });

  describe('remove', () => {
    it('should soft delete conversation', async () => {
      mockPrismaService.conversation.findFirst.mockResolvedValue({ id: 'c-1' });
      mockPrismaService.conversation.update.mockResolvedValue({
        id: 'c-1',
        deletedAt: new Date(),
      });

      await service.remove('org-1', 'c-1');
      expect(mockPrismaService.conversation.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe('getStats', () => {
    it('should calculate stats', async () => {
      mockPrismaService.subscription.findFirst.mockResolvedValue({
        currentPeriodStart: new Date(),
      });
      mockPrismaService.conversation.count.mockImplementation((args) => {
        if (args.where.status === 'active') return 2;
        return 5;
      });
      mockPrismaService.message.count.mockResolvedValue(20);

      const result = await service.getStats('org-1');
      expect(result).toEqual({
        totalConversations: 5,
        activeConversations: 2,
        totalMessagesMonth: 20,
      });
    });
  });
});
