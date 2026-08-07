import { of } from 'rxjs';
import { WhatsappWorkerController } from './whatsapp-worker.controller';

/**
 * El foco de estas pruebas es qué sale —o no sale— hacia el WhatsApp del cliente.
 *
 * Con la conversación intervenida por un humano, el bot no debe emitir nada: ni respuesta,
 * ni avisos de media, ni el acuse de lectura (la palomita azul afirma que alguien leyó el
 * mensaje, y con el bot apagado nadie lo leyó).
 */
describe('WhatsappWorkerController', () => {
  let controller: WhatsappWorkerController;

  const mockHttpService: any = { post: jest.fn() };
  const mockWhatsappConfigService: any = {
    getWhatsappConfigByPhoneNumber: jest.fn(),
    sendTextMessage: jest.fn(),
    updateConnectionStatus: jest.fn(),
    updatePhoneNumber: jest.fn(),
    handleActionsDerivatedFromMetadata: jest.fn(),
  };
  const mockLogger: any = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const mockWorkflowsService: any = { getMediaPolicy: jest.fn(), execute: jest.fn() };
  const mockQueueService: any = {
    peekLastBufferedAt: jest.fn(),
    drainWindow: jest.fn(),
    commitWindow: jest.fn(),
  };
  const mockMediaProcessingService: any = { processIncomingAttachments: jest.fn() };
  const mockConversationsService: any = {
    findActiveWhatsappConversation: jest.fn(),
    findOne: jest.fn(),
  };
  const mockCloudTasks: any = { enqueue: jest.fn() };

  const body = {
    organizationId: 'org-1',
    phoneNumber: '+521111111111',
    userNumber: '+527821176985',
    windowId: 'w-1',
  };

  const policy = {
    audio: { enabled: true, maxSeconds: 120 },
    image: { enabled: false, maxBytes: 1000 },
    video: { enabled: false },
    messages: {
      audioDisabled: 'audio apagado',
      audioTooLong: 'audio muy largo',
      audioFailed: 'no pude escuchar el audio',
      imageDisabled: 'no puedo leer imágenes',
      imageTooLarge: 'imagen muy grande',
      videoDisabled: 'no puedo ver videos',
      unsupportedFormat: 'formato no soportado',
    },
  };

  const textMessage = (text: string, messageId = 'm-1') => ({
    messageId,
    sendTime: '2026-08-07T17:00:00Z',
    bufferedAt: Date.now(),
    event: { whatsappInboundMessage: { type: 'text', text: { body: text }, from: body.userNumber } },
  });

  const imageMessage = (messageId = 'm-2') => ({
    messageId,
    sendTime: '2026-08-07T17:00:01Z',
    bufferedAt: Date.now(),
    event: { whatsappInboundMessage: { type: 'image', image: {}, from: body.userNumber } },
  });

  const buildResponse = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.Y_CLOUD_API_KEY = 'test-key';

    controller = new WhatsappWorkerController(
      mockHttpService,
      mockWhatsappConfigService,
      mockLogger,
      mockWorkflowsService,
      mockQueueService,
      mockMediaProcessingService,
      mockConversationsService,
      mockCloudTasks,
    );

    // Buffer vacío: `deferIfStillTyping` no reagenda y la ventana se procesa de inmediato.
    mockQueueService.peekLastBufferedAt.mockResolvedValue(null);
    mockQueueService.drainWindow.mockResolvedValue({
      messages: [textMessage('hola')],
      processingKey: 'proc-1',
    });
    mockWhatsappConfigService.getWhatsappConfigByPhoneNumber.mockResolvedValue({
      id: 'wa-1',
      isActive: true,
      defaultWorkflowId: 'wf-1',
      connectionStatus: 'CONNECTED',
      phoneNumber: body.phoneNumber,
    });
    mockHttpService.post.mockReturnValue(of({ data: {} }));
    mockWorkflowsService.getMediaPolicy.mockResolvedValue(policy);
    mockConversationsService.findActiveWhatsappConversation.mockResolvedValue({
      id: 'conv-1',
      isHumanInTheLoop: false,
    });
    mockConversationsService.findOne.mockResolvedValue({ id: 'conv-1', metadata: {} });
  });

  describe('conversación intervenida por un humano', () => {
    beforeEach(() => {
      mockConversationsService.findActiveWhatsappConversation.mockResolvedValue({
        id: 'conv-1',
        isHumanInTheLoop: true,
      });
      mockWorkflowsService.execute.mockResolvedValue({
        id: 'exec-1',
        result: { messages: [], skipped: 'hitl', conversationId: 'conv-1' },
      });
    });

    it('no envía nada al cliente y cierra la ventana', async () => {
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(mockWhatsappConfigService.sendTextMessage).not.toHaveBeenCalled();
      expect(mockQueueService.commitWindow).toHaveBeenCalledWith('proc-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith({ processed: false, reason: 'hitl' });
    });

    it('no marca el mensaje como leído', async () => {
      await controller.processWindow(body, buildResponse());

      // El único uso de httpService en este flujo es el typing indicator / acuse de lectura.
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('tampoco manda los avisos de media', async () => {
      mockQueueService.drainWindow.mockResolvedValue({
        messages: [imageMessage(), textMessage('¿me ayudas?')],
        processingKey: 'proc-1',
      });

      await controller.processWindow(body, buildResponse());

      // Con las imágenes apagadas en la política, el flujo normal avisaría "no puedo leer
      // imágenes". Es texto del bot, y el bot está apagado.
      expect(mockWhatsappConfigService.sendTextMessage).not.toHaveBeenCalled();
    });
  });

  describe('conversación normal', () => {
    it('responde con el mensaje del asistente y marca como leído', async () => {
      mockWorkflowsService.execute.mockResolvedValue({
        id: 'exec-1',
        result: {
          messages: [{ role: 'assistant', content: 'Claro, con gusto te ayudo.' }],
          conversationId: 'conv-1',
        },
      });
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(mockHttpService.post).toHaveBeenCalled();
      expect(mockWhatsappConfigService.sendTextMessage).toHaveBeenCalledTimes(1);
      expect(mockWhatsappConfigService.sendTextMessage).toHaveBeenCalledWith(
        body.phoneNumber,
        body.userNumber,
        'Claro, con gusto te ayudo.',
      );
      expect(res.send).toHaveBeenCalledWith({ processed: true });
    });

    it('sin mensaje del asistente y sin motivo declarado: no inventa respuesta y lo reporta', async () => {
      mockWorkflowsService.execute.mockResolvedValue({
        id: 'exec-1',
        result: { messages: [], conversationId: 'conv-1' },
      });
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(mockWhatsappConfigService.sendTextMessage).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockQueueService.commitWindow).toHaveBeenCalledWith('proc-1');
      expect(res.send).toHaveBeenCalledWith({
        processed: false,
        reason: 'no-assistant-message',
      });
    });
  });
});
