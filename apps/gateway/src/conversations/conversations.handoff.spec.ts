import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { PrismaService } from '../database/prisma.service';
import { UtilityService } from '../utility/utility.service';
import { NOTIFICATIONSENUM, UserRole } from '@tesseract/types';

const mockPrismaService = {
  conversation: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

const mockUtilityService = {
  sendNotificationToAppClients: jest.fn(),
};

describe('ConversationsService - Human Handoff', () => {
  let service: ConversationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: UtilityService, useValue: mockUtilityService },
      ],
    }).compile();

    service = module.get<ConversationsService>(ConversationsService);
    jest.clearAllMocks();
  });

  it('throws NotFoundException when conversation does not exist', async () => {
    mockPrismaService.conversation.findFirst.mockResolvedValue(null);

    await expect(service.requestHumanIntervention('org-1', 'conv-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws ForbiddenException for internal conversations', async () => {
    mockPrismaService.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      workflowId: 'wf-1',
      userId: 'user-1',
      endUserId: null,
      isHumanInTheLoop: false,
    });

    await expect(service.requestHumanIntervention('org-1', 'conv-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('is idempotent when HITL is already active', async () => {
    mockPrismaService.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      workflowId: 'wf-1',
      userId: null,
      endUserId: 'end-1',
      isHumanInTheLoop: true,
    });

    await service.requestHumanIntervention('org-1', 'conv-1', 'Escalar');

    expect(mockPrismaService.conversation.update).not.toHaveBeenCalled();
    expect(mockUtilityService.sendNotificationToAppClients).not.toHaveBeenCalled();
  });

  it('activates HITL and notifies org members for external conversations', async () => {
    mockPrismaService.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      workflowId: 'wf-1',
      userId: null,
      endUserId: 'end-1',
      isHumanInTheLoop: false,
    });

    await service.requestHumanIntervention('org-1', 'conv-1', 'Cliente pide asesor humano');

    expect(mockPrismaService.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { isHumanInTheLoop: true },
    });

    expect(mockUtilityService.sendNotificationToAppClients).toHaveBeenCalledWith(
      'org-1',
      [UserRole.OWNER, UserRole.ADMIN],
      (NOTIFICATIONSENUM as any).HUMAN_INTERVENTION_REQUIRED ?? '0000-0114',
      ['conv-1', 'wf-1', 'Cliente pide asesor humano'],
    );
  });
});
