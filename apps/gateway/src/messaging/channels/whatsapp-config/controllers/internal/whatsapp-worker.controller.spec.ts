import { of } from 'rxjs';
import {
  TURN_MAX_WAIT_SECONDS,
  TURN_POLL_SECONDS,
} from '../../../shared/channel-message-queue.service';
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
  const mockWorkflowsService: any = { getChannelPolicy: jest.fn(), execute: jest.fn() };
  const mockQueueService: any = {
    peekLastBufferedAt: jest.fn(),
    drainWindow: jest.fn(),
    commitWindow: jest.fn(),
    acquireTurn: jest.fn(),
    releaseTurn: jest.fn(),
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
    // Conversación libre: el turno se toma a la primera.
    mockQueueService.acquireTurn.mockResolvedValue({ acquired: true, token: 'tok-1' });
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
    mockWorkflowsService.getChannelPolicy.mockResolvedValue({
      mediaPolicy: policy,
      presenceIndicators: true,
    });
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

    it('con presenceIndicators apagado responde igual pero sin visto ni escribiendo', async () => {
      mockWorkflowsService.getChannelPolicy.mockResolvedValue({
        mediaPolicy: policy,
        presenceIndicators: false,
      });
      mockWorkflowsService.execute.mockResolvedValue({
        id: 'exec-1',
        result: {
          messages: [{ role: 'assistant', content: 'Claro, con gusto te ayudo.' }],
          conversationId: 'conv-1',
        },
      });

      await controller.processWindow(body, buildResponse());

      // El único uso de httpService en este flujo es el typing indicator / acuse de lectura.
      expect(mockHttpService.post).not.toHaveBeenCalled();
      expect(mockWorkflowsService.execute).toHaveBeenCalled();
      expect(mockWhatsappConfigService.sendTextMessage).toHaveBeenCalledWith(
        body.phoneNumber,
        body.userNumber,
        'Claro, con gusto te ayudo.',
      );
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

  /**
   * Un turno a la vez por conversación. Sin esto, una ventana que se cierra mientras el
   * turno anterior sigue ejecutándose arranca otro en paralelo, con un historial al que le
   * faltan las respuestas del primero, y el cliente recibe varias respuestas de golpe.
   */
  describe('turno en curso en la misma conversación', () => {
    const assistantReply = () =>
      mockWorkflowsService.execute.mockResolvedValue({
        id: 'exec-1',
        result: {
          messages: [{ role: 'assistant', content: 'Claro, con gusto te ayudo.' }],
          conversationId: 'conv-1',
        },
      });

    it('si la conversación está ocupada, reagenda sin tocar el buffer ni ejecutar', async () => {
      mockQueueService.acquireTurn.mockResolvedValue({ acquired: false, token: null });
      const res = buildResponse();

      await controller.processWindow({ ...body, extension: 2 }, res);

      expect(mockQueueService.drainWindow).not.toHaveBeenCalled();
      expect(mockWorkflowsService.execute).not.toHaveBeenCalled();
      expect(mockWhatsappConfigService.sendTextMessage).not.toHaveBeenCalled();
      // No tomó la marca, así que no la suelta: es del otro turno.
      expect(mockQueueService.releaseTurn).not.toHaveBeenCalled();

      expect(mockCloudTasks.enqueue).toHaveBeenCalledTimes(1);
      const task = mockCloudTasks.enqueue.mock.calls[0][0];
      expect(task.delaySeconds).toBe(TURN_POLL_SECONDS);
      // El contador sigue al de la cadena para que el nombre de la tarea no se repita.
      expect(task.taskId.endsWith('-w-1-x3')).toBe(true);
      expect(task.payload).toEqual(
        expect.objectContaining({ windowId: 'w-1', extension: 3, busySince: expect.any(Number) }),
      );
      expect(res.send).toHaveBeenCalledWith({ processed: false, reason: 'busy', extension: 3 });
    });

    it('conserva busySince entre reagendados para que el tope cuente desde la primera espera', async () => {
      mockQueueService.acquireTurn.mockResolvedValue({ acquired: false, token: null });
      const busySince = Date.now() - 10_000;

      await controller.processWindow({ ...body, busySince }, buildResponse());

      expect(mockCloudTasks.enqueue.mock.calls[0][0].payload.busySince).toBe(busySince);
    });

    it('pasado el tope de espera procesa sin turno para no perder los mensajes', async () => {
      mockQueueService.acquireTurn.mockResolvedValue({ acquired: false, token: null });
      assistantReply();
      const res = buildResponse();

      await controller.processWindow(
        { ...body, busySince: Date.now() - TURN_MAX_WAIT_SECONDS * 1000 },
        res,
      );

      expect(mockCloudTasks.enqueue).not.toHaveBeenCalled();
      expect(mockWorkflowsService.execute).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
      expect(res.send).toHaveBeenCalledWith({ processed: true });
    });

    it('suelta su turno antes de contestarle a Cloud Tasks', async () => {
      assistantReply();
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(mockQueueService.releaseTurn).toHaveBeenCalledWith(
        body.organizationId,
        body.phoneNumber,
        body.userNumber,
        'tok-1',
      );
      // En Cloud Run la CPU se estrangula al salir la respuesta: soltar después podría
      // quedarse congelado y dejar la conversación ocupada.
      expect(mockQueueService.releaseTurn.mock.invocationCallOrder[0]).toBeLessThan(
        res.status.mock.invocationCallOrder[0],
      );
    });

    it('suelta su turno aunque la ejecución falle, para que el reintento no se bloquee', async () => {
      mockWorkflowsService.execute.mockRejectedValue(new Error('agents caído'));
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(mockQueueService.commitWindow).not.toHaveBeenCalled();
      expect(mockQueueService.releaseTurn).toHaveBeenCalledWith(
        body.organizationId,
        body.phoneNumber,
        body.userNumber,
        'tok-1',
      );
    });

    it('suelta su turno aunque falle algo fuera del manejo de errores del turno', async () => {
      mockQueueService.drainWindow.mockRejectedValue(new Error('Upstash caído'));

      await expect(controller.processWindow(body, buildResponse())).rejects.toThrow(
        'Upstash caído',
      );

      expect(mockQueueService.releaseTurn).toHaveBeenCalledWith(
        body.organizationId,
        body.phoneNumber,
        body.userNumber,
        'tok-1',
      );
    });

    it('suelta su turno cuando la ventana resulta vacía', async () => {
      mockQueueService.drainWindow.mockResolvedValue({ messages: [], processingKey: null });
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(res.send).toHaveBeenCalledWith({ processed: false, reason: 'empty-window' });
      expect(mockQueueService.releaseTurn).toHaveBeenCalledTimes(1);
    });
  });
});
