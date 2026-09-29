import { ForbiddenException, HttpStatus } from '@nestjs/common';
import { TriggerType } from '@tesseract/database';
import {
  TURN_MAX_WAIT_SECONDS,
  TURN_POLL_SECONDS,
} from '../../../shared/channel-message-queue.service';
import { WhatsappWorkerController } from './whatsapp-worker.controller';
import {
  WHATSAPP_MAX_WINDOW_SECONDS,
  WHATSAPP_WINDOW_SECONDS,
} from '../../whatsapp-message-queue.service';

/**
 * Cobertura de `processWindow`, con foco en los escenarios de falla y en el nuevo
 * enrutado multi-proveedor (YCloud / Meta) introducido junto con los transporters y los
 * payload consumers. El `WBPayloadConsumerResolver` se mockea por completo: la clase real
 * pide 4 dependencias (logger, mediaProcessingService, workflowsService,
 * whatsappConfigService) que no hacen falta aquí, y acoplarse a ellas solo haría frágil
 * esta suite ante cambios de esas otras piezas.
 */
describe('WhatsappWorkerController · processWindow', () => {
  let controller: WhatsappWorkerController;

  const mockWhatsappConfigService: any = {
    getWhatsappConfigByPhoneNumber: jest.fn(),
    sendTextMessage: jest.fn(),
    markMessagesAsRead: jest.fn(),
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
  const mockConversationsService: any = {
    findActiveWhatsappConversation: jest.fn(),
    findOne: jest.fn(),
  };
  const mockCloudTasks: any = { enqueue: jest.fn() };
  const mockPayloadConsumer: any = { getInterpretedMessage: jest.fn() };
  const mockPayloadConsumerResolver: any = { forProvider: jest.fn() };

  const body = {
    organizationId: 'org-1',
    agentPhoneNumber: '+521111111111',
    clientPhoneNumber: '+527821176985',
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
    event: {
      type: 'whatsapp.inbound_message.received',
      whatsappInboundMessage: { type: 'text', text: { body: text }, from: body.clientPhoneNumber },
    },
  });

  const successfulExecution = (content = 'Claro, con gusto te ayudo.') => ({
    id: 'exec-1',
    result: { messages: [{ role: 'assistant', content }], conversationId: 'conv-1' },
  });

  const buildResponse = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    // `resetAllMocks` (no solo `clearAllMocks`) es necesario: un `mockRejectedValue` que
    // un test deja puesto en uno de los mocks compartidos de arriba sobrevive a
    // `clearAllMocks` (que solo borra el historial de llamadas) y se filtraría a los
    // tests siguientes.
    jest.resetAllMocks();

    controller = new WhatsappWorkerController(
      mockWhatsappConfigService,
      mockLogger,
      mockWorkflowsService,
      mockQueueService,
      mockConversationsService,
      mockCloudTasks,
      mockPayloadConsumerResolver,
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
      approvedAt: new Date('2026-01-01'),
      defaultWorkflowId: 'wf-1',
      connectionStatus: 'CONNECTED',
      phoneNumber: body.agentPhoneNumber,
      provider: 'ycloud',
    });
    mockWorkflowsService.getChannelPolicy.mockResolvedValue({
      mediaPolicy: policy,
      presenceIndicators: true,
    });
    mockConversationsService.findActiveWhatsappConversation.mockResolvedValue({
      id: 'conv-1',
      isHumanInTheLoop: false,
    });
    mockConversationsService.findOne.mockResolvedValue({ id: 'conv-1', metadata: {} });
    mockWhatsappConfigService.markMessagesAsRead.mockResolvedValue(undefined);
    mockPayloadConsumerResolver.forProvider.mockResolvedValue(mockPayloadConsumer);
    mockPayloadConsumer.getInterpretedMessage.mockResolvedValue({ text: 'hola' });
  });

  // ─── deferIfStillTyping ────────────────────────────────────────────────

  describe('ventana deslizante (deferIfStillTyping)', () => {
    it('reagenda cuando el buffer tiene actividad más reciente que el silencio requerido', async () => {
      mockQueueService.peekLastBufferedAt.mockResolvedValue(Date.now() - 1000); // 1s < 8s por defecto
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(mockCloudTasks.enqueue).toHaveBeenCalledTimes(1);
      expect(mockCloudTasks.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: expect.stringContaining('-x1'),
          payload: expect.objectContaining({ extension: 1 }),
        }),
      );
      expect(mockQueueService.drainWindow).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({ processed: false, reason: 'still-typing', extension: 1 }),
      );
    });

    it('incrementa la extensión ya existente en vez de reiniciarla', async () => {
      mockQueueService.peekLastBufferedAt.mockResolvedValue(Date.now() - 1000);

      await controller.processWindow({ ...body, extension: 2 }, buildResponse());

      expect(mockCloudTasks.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: expect.stringContaining('-x3') }),
      );
    });

    it('deja de reagendar y procesa lo acumulado al llegar al tope total, aunque siga "escribiendo"', async () => {
      mockQueueService.peekLastBufferedAt.mockResolvedValue(Date.now() - 1000); // sigue escribiendo
      mockQueueService.drainWindow.mockResolvedValue({ messages: [], processingKey: null });

      await controller.processWindow(
        { ...body, windowStartedAt: Date.now() - (WHATSAPP_MAX_WINDOW_SECONDS * 1000 + 5000) },
        buildResponse(),
      );

      expect(mockCloudTasks.enqueue).not.toHaveBeenCalled();
      expect(mockQueueService.drainWindow).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Tope de ventana alcanzado, se responde con lo acumulado',
        expect.anything(),
      );
    });

    it('procesa de inmediato una vez que el silencio ya superó la ventana', async () => {
      mockQueueService.peekLastBufferedAt.mockResolvedValue(
        Date.now() - (WHATSAPP_WINDOW_SECONDS * 1000 + 1000),
      );

      await controller.processWindow(body, buildResponse());

      expect(mockCloudTasks.enqueue).not.toHaveBeenCalled();
      expect(mockQueueService.drainWindow).toHaveBeenCalled();
    });
  });

  // ─── Guardas tempranas ─────────────────────────────────────────────────

  describe('guardas antes de procesar', () => {
    it('reporta ventana vacía sin tocar la cuenta', async () => {
      mockQueueService.drainWindow.mockResolvedValue({ messages: [], processingKey: null });
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(mockWhatsappConfigService.getWhatsappConfigByPhoneNumber).not.toHaveBeenCalled();
      expect(res.send).toHaveBeenCalledWith({ processed: false, reason: 'empty-window' });
    });

    it('confirma la ventana y no reintenta si no hay config para el número', async () => {
      mockWhatsappConfigService.getWhatsappConfigByPhoneNumber.mockResolvedValue(null);
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(mockQueueService.commitWindow).toHaveBeenCalledWith('proc-1');
      expect(res.send).toHaveBeenCalledWith({ processed: false, reason: 'ausent-config' });
    });

    it('confirma la ventana y no reintenta si la config no tiene workflow por defecto (ninguno de los dos proveedores)', async () => {
      mockWhatsappConfigService.getWhatsappConfigByPhoneNumber.mockResolvedValue({
        id: 'wa-1',
        isActive: true,
        approvedAt: new Date('2026-01-01'),
        defaultWorkflowId: null,
        connectionStatus: 'CONNECTED',
        phoneNumber: body.agentPhoneNumber,
        provider: 'meta',
      });
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(mockQueueService.commitWindow).toHaveBeenCalledWith('proc-1');
      expect(res.send).toHaveBeenCalledWith({ processed: false, reason: 'missing-config' });
      // La refactorización multi-proveedor quitó el gate de Y_CLOUD_API_KEY: ya no debe
      // condicionar el procesamiento de una cuenta 'meta' a que exista esa env var.
      expect(mockWorkflowsService.getChannelPolicy).not.toHaveBeenCalled();
    });
  });

  // ─── Acuse de lectura / typing indicator (multi-proveedor) ────────────

  describe('acuse de lectura y typing indicator', () => {
    beforeEach(() => {
      mockWorkflowsService.execute.mockResolvedValue(successfulExecution());
    });

    it('delega en whatsapp-config.service sin importar el proveedor (ycloud)', async () => {
      await controller.processWindow(body, buildResponse());

      expect(mockWhatsappConfigService.markMessagesAsRead).toHaveBeenCalledWith(
        body.agentPhoneNumber,
        ['m-1'],
      );
    });

    it('delega igual para una cuenta meta: el controller no distingue proveedores a este nivel', async () => {
      mockWhatsappConfigService.getWhatsappConfigByPhoneNumber.mockResolvedValue({
        id: 'wa-1',
        isActive: true,
        approvedAt: new Date('2026-01-01'),
        defaultWorkflowId: 'wf-1',
        connectionStatus: 'CONNECTED',
        phoneNumber: body.agentPhoneNumber,
        provider: 'meta',
      });

      await controller.processWindow(body, buildResponse());

      expect(mockWhatsappConfigService.markMessagesAsRead).toHaveBeenCalledWith(
        body.agentPhoneNumber,
        ['m-1'],
      );
    });

    it('no marca como leído ni manda avisos con la conversación intervenida', async () => {
      mockConversationsService.findActiveWhatsappConversation.mockResolvedValue({
        id: 'conv-1',
        isHumanInTheLoop: true,
      });
      mockWorkflowsService.execute.mockResolvedValue({
        id: 'exec-1',
        result: { messages: [], skipped: 'hitl', conversationId: 'conv-1' },
      });

      await controller.processWindow(body, buildResponse());

      expect(mockWhatsappConfigService.markMessagesAsRead).not.toHaveBeenCalled();
      expect(mockWhatsappConfigService.sendTextMessage).not.toHaveBeenCalled();
    });

    it('[corregido] un fallo al marcar como leído (transporter caído, credencial mala) ya NO aborta la ventana: se registra y se sigue', async () => {
      mockWhatsappConfigService.markMessagesAsRead.mockRejectedValue(new Error('transporter caído'));
      mockWorkflowsService.execute.mockResolvedValue(successfulExecution('Claro, con gusto te ayudo.'));
      const res = buildResponse();

      await controller.processWindow(body, res);

      // El fallo de la palomita/typing indicator es cosmético: ya no debe impedir que el
      // cliente reciba su respuesta real.
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No se pudo marcar la ventana como leída / mandar el typing indicator',
        expect.objectContaining({ error: 'transporter caído' }),
      );
      expect(mockWorkflowsService.execute).toHaveBeenCalled();
      expect(mockWhatsappConfigService.sendTextMessage).toHaveBeenCalledWith(
        body.agentPhoneNumber,
        body.clientPhoneNumber,
        'Claro, con gusto te ayudo.',
      );
      expect(mockQueueService.commitWindow).toHaveBeenCalledWith('proc-1');
      expect(res.send).toHaveBeenCalledWith({ processed: true });
    });
  });

  // ─── Estado de conexión / número ───────────────────────────────────────

  describe('actualizaciones de estado de la cuenta', () => {
    beforeEach(() => {
      mockWorkflowsService.execute.mockResolvedValue(successfulExecution());
    });

    it('reconecta la cuenta si no estaba CONNECTED', async () => {
      mockWhatsappConfigService.getWhatsappConfigByPhoneNumber.mockResolvedValue({
        id: 'wa-1',
        isActive: true,
        approvedAt: new Date('2026-01-01'),
        defaultWorkflowId: 'wf-1',
        connectionStatus: 'DISCONNECTED',
        phoneNumber: body.agentPhoneNumber,
        provider: 'ycloud',
      });

      await controller.processWindow(body, buildResponse());

      expect(mockWhatsappConfigService.updateConnectionStatus).toHaveBeenCalledWith('wa-1', 'CONNECTED');
    });

    it('no toca el estado si ya estaba CONNECTED', async () => {
      await controller.processWindow(body, buildResponse());

      expect(mockWhatsappConfigService.updateConnectionStatus).not.toHaveBeenCalled();
    });

    it('rellena el número guardado si venía vacío', async () => {
      mockWhatsappConfigService.getWhatsappConfigByPhoneNumber.mockResolvedValue({
        id: 'wa-1',
        isActive: true,
        approvedAt: new Date('2026-01-01'),
        defaultWorkflowId: 'wf-1',
        connectionStatus: 'CONNECTED',
        phoneNumber: '',
        provider: 'ycloud',
      });

      await controller.processWindow(body, buildResponse());

      expect(mockWhatsappConfigService.updatePhoneNumber).toHaveBeenCalledWith('wa-1', body.agentPhoneNumber);
    });
  });

  // ─── Interpretación de mensajes (multi-proveedor) ─────────────────────

  describe('interpretación de mensajes', () => {
    beforeEach(() => {
      mockWorkflowsService.execute.mockResolvedValue(successfulExecution());
    });

    it('resuelve el payload consumer con el proveedor de la cuenta (ycloud)', async () => {
      await controller.processWindow(body, buildResponse());

      expect(mockPayloadConsumerResolver.forProvider).toHaveBeenCalledWith(
        'ycloud',
        expect.anything(),
      );
    });

    it('resuelve el payload consumer con el proveedor de la cuenta (meta)', async () => {
      mockWhatsappConfigService.getWhatsappConfigByPhoneNumber.mockResolvedValue({
        id: 'wa-1',
        isActive: true,
        approvedAt: new Date('2026-01-01'),
        defaultWorkflowId: 'wf-1',
        connectionStatus: 'CONNECTED',
        phoneNumber: body.agentPhoneNumber,
        provider: 'meta',
      });

      await controller.processWindow(body, buildResponse());

      expect(mockPayloadConsumerResolver.forProvider).toHaveBeenCalledWith('meta', expect.anything());
    });

    it('[corregido] con una ráfaga de varios mensajes, construye UN consumer POR mensaje, cada uno con su propio evento', async () => {
      const m1 = textMessage('hola', 'm-1');
      const m2 = textMessage('cómo estás', 'm-2');
      const m3 = textMessage('gracias', 'm-3');
      mockQueueService.drainWindow.mockResolvedValue({ messages: [m1, m2, m3], processingKey: 'proc-1' });

      await controller.processWindow(body, buildResponse());

      expect(mockPayloadConsumerResolver.forProvider).toHaveBeenCalledTimes(3);
      expect(mockPayloadConsumerResolver.forProvider).toHaveBeenNthCalledWith(1, 'ycloud', m1.event);
      expect(mockPayloadConsumerResolver.forProvider).toHaveBeenNthCalledWith(2, 'ycloud', m2.event);
      expect(mockPayloadConsumerResolver.forProvider).toHaveBeenNthCalledWith(3, 'ycloud', m3.event);
      expect(mockPayloadConsumer.getInterpretedMessage).toHaveBeenCalledTimes(3);
    });

    it('[corregido] agrega el texto propio de cada mensaje de la ráfaga en vez de repetir el primero', async () => {
      mockQueueService.drainWindow.mockResolvedValue({
        messages: [
          textMessage('hola', 'm-1'),
          textMessage('cómo estás', 'm-2'),
          textMessage('gracias', 'm-3'),
        ],
        processingKey: 'proc-1',
      });
      mockPayloadConsumer.getInterpretedMessage
        .mockResolvedValueOnce({ text: 'hola' })
        .mockResolvedValueOnce({ text: 'cómo estás' })
        .mockResolvedValueOnce({ text: 'gracias' });

      await controller.processWindow(body, buildResponse());

      expect(mockWorkflowsService.execute).toHaveBeenCalledWith(
        'org-1',
        'wf-1',
        { message: 'hola\ncómo estás\ngracias' },
        expect.anything(),
        undefined,
        mockPayloadConsumer,
        undefined,
        TriggerType.WEBHOOK,
      );
    });

    it('[corregido] el payload consumer que se le pasa a execute() sigue siendo el del primer mensaje ("dueño" de la ventana)', async () => {
      const first = mockPayloadConsumer;
      const second = { getInterpretedMessage: jest.fn().mockResolvedValue({ text: 'cómo estás' }) };
      mockPayloadConsumerResolver.forProvider.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
      mockQueueService.drainWindow.mockResolvedValue({
        messages: [textMessage('hola', 'm-1'), textMessage('cómo estás', 'm-2')],
        processingKey: 'proc-1',
      });

      await controller.processWindow(body, buildResponse());

      expect(mockWorkflowsService.execute).toHaveBeenCalledWith(
        'org-1',
        'wf-1',
        expect.anything(),
        expect.anything(),
        undefined,
        first,
        undefined,
        TriggerType.WEBHOOK,
      );
    });
  });

  // ─── Sin texto útil ─────────────────────────────────────────────────────

  describe('ventana sin texto útil', () => {
    it('avisa formato no soportado y registra el error cuando no hay texto ni avisos', async () => {
      mockPayloadConsumer.getInterpretedMessage.mockResolvedValue({});
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(mockWhatsappConfigService.sendTextMessage).toHaveBeenCalledWith(
        body.agentPhoneNumber,
        body.clientPhoneNumber,
        policy.messages.unsupportedFormat,
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'No se pudo extraer texto de la ventana',
        expect.anything(),
      );
      expect(mockQueueService.commitWindow).toHaveBeenCalledWith('proc-1');
      expect(res.send).toHaveBeenCalledWith({ processed: false, reason: 'no-text' });
    });

    it('con la conversación intervenida, igual registra el error pero no manda el aviso', async () => {
      mockPayloadConsumer.getInterpretedMessage.mockResolvedValue({});
      mockConversationsService.findActiveWhatsappConversation.mockResolvedValue({
        id: 'conv-1',
        isHumanInTheLoop: true,
      });

      await controller.processWindow(body, buildResponse());

      expect(mockWhatsappConfigService.sendTextMessage).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'No se pudo extraer texto de la ventana',
        expect.anything(),
      );
    });

    it('si hubo un aviso de política (p.ej. imagen deshabilitada), no duplica con el de formato no soportado', async () => {
      mockPayloadConsumer.getInterpretedMessage.mockResolvedValue({ notice: policy.messages.imageDisabled });
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(mockWhatsappConfigService.sendTextMessage).toHaveBeenCalledTimes(1);
      expect(mockWhatsappConfigService.sendTextMessage).toHaveBeenCalledWith(
        body.agentPhoneNumber,
        body.clientPhoneNumber,
        policy.messages.imageDisabled,
      );
      expect(res.send).toHaveBeenCalledWith({ processed: false, reason: 'no-text' });
    });
  });

  // ─── Ejecución del workflow y extracción de la respuesta ───────────────

  describe('respuesta del workflow', () => {
    it('no responde y lo reporta cuando `messages` viene ausente del resultado', async () => {
      mockWorkflowsService.execute.mockResolvedValue({ id: 'exec-1', result: { conversationId: 'conv-1' } });
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(mockWhatsappConfigService.sendTextMessage).not.toHaveBeenCalled();
      expect(res.send).toHaveBeenCalledWith({ processed: false, reason: 'no-assistant-message' });
    });

    it('no responde si el último mensaje no es del asistente', async () => {
      mockWorkflowsService.execute.mockResolvedValue({
        id: 'exec-1',
        result: { messages: [{ role: 'user', content: 'eco' }], conversationId: 'conv-1' },
      });

      await controller.processWindow(body, buildResponse());

      expect(mockWhatsappConfigService.sendTextMessage).not.toHaveBeenCalled();
    });

    it('reporta hitl con nivel info (no error) cuando un humano está atendiendo', async () => {
      mockWorkflowsService.execute.mockResolvedValue({
        id: 'exec-1',
        result: { messages: [], skipped: 'hitl', conversationId: 'conv-1' },
      });
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Conversación intervenida por un humano: el bot no responde',
        expect.anything(),
      );
      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(res.send).toHaveBeenCalledWith({ processed: false, reason: 'hitl' });
    });

    it('responde, comita la ventana y ejecuta las acciones post-turno en el camino feliz', async () => {
      mockWorkflowsService.execute.mockResolvedValue(successfulExecution('Claro, con gusto te ayudo.'));
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(mockWhatsappConfigService.sendTextMessage).toHaveBeenCalledWith(
        body.agentPhoneNumber,
        body.clientPhoneNumber,
        'Claro, con gusto te ayudo.',
      );
      expect(mockQueueService.commitWindow).toHaveBeenCalledWith('proc-1');
      expect(mockConversationsService.findOne).toHaveBeenCalledWith('org-1', 'conv-1');
      expect(mockWhatsappConfigService.handleActionsDerivatedFromMetadata).toHaveBeenCalledWith(
        'conv-1',
        'org-1',
        {},
        mockPayloadConsumer,
        'wf-1',
      );
      expect(res.send).toHaveBeenCalledWith({ processed: true });
    });

    it('un fallo en las acciones post-turno no cambia la respuesta ya enviada al cliente', async () => {
      mockWorkflowsService.execute.mockResolvedValue(successfulExecution());
      mockWhatsappConfigService.handleActionsDerivatedFromMetadata.mockRejectedValue(
        new Error('drive caído'),
      );
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(mockWhatsappConfigService.sendTextMessage).toHaveBeenCalledTimes(1);
      expect(mockQueueService.commitWindow).toHaveBeenCalledWith('proc-1');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Fallaron las acciones derivadas de metadata',
        expect.anything(),
      );
      expect(res.send).toHaveBeenCalledWith({ processed: true });
    });

    it('lo mismo si falla la relectura de la conversación (findOne) para las acciones post-turno', async () => {
      mockWorkflowsService.execute.mockResolvedValue(successfulExecution());
      mockConversationsService.findOne.mockRejectedValue(new Error('conversación borrada'));
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(mockQueueService.commitWindow).toHaveBeenCalledWith('proc-1');
      expect(res.send).toHaveBeenCalledWith({ processed: true });
    });
  });

  // ─── Manejo de errores ──────────────────────────────────────────────────

  describe('manejo de errores', () => {
    it('confirma la ventana sin reintentar cuando el workflow bloquea la ejecución (sin crédito/suscripción)', async () => {
      mockWorkflowsService.execute.mockRejectedValue(new ForbiddenException('Sin créditos'));
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(mockQueueService.commitWindow).toHaveBeenCalledWith('proc-1');
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.send).toHaveBeenCalledWith({ processed: false, reason: 'blocked' });
    });

    it('NO confirma la ventana ante un error genérico del workflow, para que Cloud Tasks reintente', async () => {
      mockWorkflowsService.execute.mockRejectedValue(new Error('DB caída'));
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(mockQueueService.commitWindow).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(res.send).toHaveBeenCalledWith({ processed: false });
    });

    it('NO confirma la ventana si falla la resolución de la política de media', async () => {
      // `getChannelPolicy` solo se consulta cuando no hay texto ni avisos que agregar
      // (para decidir si hace falta el aviso de "formato no soportado"); hace falta caer
      // en esa rama para que el rechazo del mock se dispare.
      mockPayloadConsumer.getInterpretedMessage.mockResolvedValue({});
      mockWorkflowsService.getChannelPolicy.mockRejectedValue(new Error('workflow sin config'));
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(mockQueueService.commitWindow).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('NO confirma la ventana si la propia búsqueda de la cuenta lanza (no es lo mismo que "no encontrada")', async () => {
      mockWhatsappConfigService.getWhatsappConfigByPhoneNumber.mockRejectedValue(
        new Error('timeout de conexión'),
      );
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(mockQueueService.commitWindow).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('sigue devolviendo 500 (fallo genuinamente transitorio) si forProvider falla por una causa distinta a un proveedor no soportado', async () => {
      mockPayloadConsumerResolver.forProvider.mockRejectedValue(new Error('timeout resolviendo el consumer'));
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockQueueService.commitWindow).not.toHaveBeenCalled();
    });
  });

  // ─── Proveedor no soportado / corrupto en la config ─────────────────────

  describe('[corregido] proveedor no soportado en la config de la cuenta', () => {
    it('descarta la ventana sin reintentar, en vez de fallar con 500 en un bucle indefinido', async () => {
      mockWhatsappConfigService.getWhatsappConfigByPhoneNumber.mockResolvedValue({
        id: 'wa-1',
        isActive: true,
        approvedAt: new Date('2026-01-01'),
        defaultWorkflowId: 'wf-1',
        connectionStatus: 'CONNECTED',
        phoneNumber: body.agentPhoneNumber,
        // Un typo, una migración a medias, o un proveedor que se dio de baja: no es un
        // problema de disponibilidad y un reintento jamás lo arregla.
        provider: 'baileys',
      });
      const res = buildResponse();

      await controller.processWindow(body, res);

      expect(mockQueueService.commitWindow).toHaveBeenCalledWith('proc-1');
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.send).toHaveBeenCalledWith({ processed: false, reason: 'unsupported-provider' });
    });

    it('ni siquiera intenta marcar como leído ni resolver un payload consumer para ese proveedor', async () => {
      mockWhatsappConfigService.getWhatsappConfigByPhoneNumber.mockResolvedValue({
        id: 'wa-1',
        isActive: true,
        approvedAt: new Date('2026-01-01'),
        defaultWorkflowId: 'wf-1',
        connectionStatus: 'CONNECTED',
        phoneNumber: body.agentPhoneNumber,
        provider: 'baileys',
      });

      await controller.processWindow(body, buildResponse());

      expect(mockWhatsappConfigService.markMessagesAsRead).not.toHaveBeenCalled();
      expect(mockPayloadConsumerResolver.forProvider).not.toHaveBeenCalled();
      expect(mockWorkflowsService.execute).not.toHaveBeenCalled();
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
        body.agentPhoneNumber,
        body.clientPhoneNumber,
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
        body.agentPhoneNumber,
        body.clientPhoneNumber,
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
        body.agentPhoneNumber,
        body.clientPhoneNumber,
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
