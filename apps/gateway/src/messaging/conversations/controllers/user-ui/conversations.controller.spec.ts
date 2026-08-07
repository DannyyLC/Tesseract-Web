import { Test, TestingModule } from '@nestjs/testing';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from '../../conversations.service';
import { NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { UpdateConversationDto } from '../../dto';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import { UserRole } from '@tesseract/types';
import { MediaProcessingService } from '@/automation/media-processing/media-processing.service';

const mockConversationsService = {
  findAll: jest.fn(),
  getStats: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  resolveWorkflowMediaPolicy: jest.fn(),
};

const mockMediaProcessingService = {
  transcribeDictation: jest.fn(),
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
        { provide: MediaProcessingService, useValue: mockMediaProcessingService },
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
        undefined,
        undefined,
        undefined,
        'true',
        res,
      );

      expect(mockConversationsService.findAll).toHaveBeenCalledWith({
        organizationId: 'org-1',
        cursor: null,
        take: 10,
        paginationAction: null,
        status: undefined,
        isHumanInTheLoop: undefined,
        needsFollowUp: undefined,
        workflowId: undefined,
        userId: undefined,
        prioritizeHitl: true,
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

      await expect(controller.getById(mockUser, 'c-1', res)).rejects.toThrow(NotFoundException);
    });
  });

  describe('transcribe', () => {
    const audioRequest = (body: unknown) =>
      ({ body, headers: { 'content-type': 'audio/webm' } }) as any;

    it('devuelve la transcripción del dictado', async () => {
      mockMediaProcessingService.transcribeDictation.mockResolvedValue({
        status: 'PROCESSED',
        text: 'hola',
      });
      const res = mockResponse();

      await controller.transcribe(audioRequest(Buffer.from('audio')), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: { text: 'hola' }, success: true }),
      );
    });

    it('transcribe con el audio siempre habilitado, sin mirar la política del workflow', async () => {
      mockMediaProcessingService.transcribeDictation.mockResolvedValue({
        status: 'PROCESSED',
        text: 'hola',
      });
      const res = mockResponse();

      await controller.transcribe(audioRequest(Buffer.from('audio')), res);

      // Dictar es una comodidad del operador: lo que se envía al workflow es texto,
      // así que no depende de lo que el agente sepa escuchar por WhatsApp.
      expect(mockMediaProcessingService.transcribeDictation).toHaveBeenCalledWith(
        expect.objectContaining({ policy: expect.objectContaining({ audio: { enabled: true, maxSeconds: 300 } }) }),
      );
      // Y tampoco consulta la conversación, para que funcione en /conversations/new
      expect(mockConversationsService.findOne).not.toHaveBeenCalled();
    });

    it('devuelve 502 cuando falla el proveedor de transcripción', async () => {
      mockMediaProcessingService.transcribeDictation.mockResolvedValue({
        status: 'FAILED',
        message: 'No pude escuchar tu audio',
      });
      const res = mockResponse();

      await controller.transcribe(audioRequest(Buffer.from('audio')), res);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'No pude escuchar tu audio' }),
      );
    });

    it('tolera un cuerpo que no es Buffer sin reventar', async () => {
      mockMediaProcessingService.transcribeDictation.mockResolvedValue({
        status: 'REJECTED',
        reason: 'EMPTY_AUDIO',
        message: 'vacío',
      });
      const res = mockResponse();

      // Si el Content-Type no casa con el parser raw, Express deja un objeto vacío
      await controller.transcribe(audioRequest({}), res);

      expect(mockMediaProcessingService.transcribeDictation).toHaveBeenCalledWith(
        expect.objectContaining({ buffer: Buffer.alloc(0) }),
      );
      expect(res.status).toHaveBeenCalledWith(400);
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
