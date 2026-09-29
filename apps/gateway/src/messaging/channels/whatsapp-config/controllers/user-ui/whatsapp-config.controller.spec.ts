import { HttpStatus } from '@nestjs/common';
import { ChatRole } from '@tesseract/database';
import { UserRole } from '@tesseract/types';
import { ROLES_KEY } from '@/identity/auth/decorators/roles.decorator';
import { WhatsappConfigController } from './whatsapp-config.controller';
import { EBMessageType, WBEventTypes } from '../../payload-consumers/wb-payload-consumer.interface';

/**
 * Cobertura de `handleWebhook`, con foco en los escenarios de falla y en el enrutado
 * multi-proveedor (YCloud / Meta) introducido junto con `WBPayloadConsumerResolver`.
 *
 * El resolver se mockea por completo: la clase real pide 4 dependencias (logger,
 * mediaProcessingService, workflowsService, whatsappConfigService) que no hacen falta
 * para probar el controller, y acoplarse a ellas solo haría frágil esta suite ante
 * cambios de esas otras piezas. En su lugar se construye un `IWBPayloadConsumer` falso
 * por test, configurable campo a campo.
 */
describe('WhatsappConfigController · handleWebhook', () => {
  let controller: WhatsappConfigController;

  const mockWhatsappConfigService: any = {
    getWhatsappConfigByPhoneNumber: jest.fn(),
    updateConnectionStatusByPhoneNumber: jest.fn(),
    updateConnectionErrorByPhoneNumber: jest.fn(),
  };
  const mockLogger: any = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const mockQueueService: any = { bufferMessage: jest.fn(), buildWindowId: jest.fn(() => 'w-1') };
  const mockCloudTasks: any = { enqueue: jest.fn() };
  const mockWebhookDedup: any = { claim: jest.fn(), release: jest.fn() };
  const mockWorkflowsService: any = { getRoutingState: jest.fn() };
  const mockConversationsService: any = {
    findActiveWhatsappConversation: jest.fn(),
    findOrCreateConversationFromWhatsAppMessage: jest.fn(),
    addMessage: jest.fn(),
    markMessageOutsideWorkflow: jest.fn(),
  };
  const mockEndUsersService: any = { isBlocked: jest.fn() };
  const mockPayloadConsumerResolver: any = { forProvider: jest.fn() };
  const mockMediaProcessingService: any = {};

  const AGENT_NUMBER = '+5211111111111';
  const CLIENT_NUMBER = '+5215512345678';

  const buildConsumer = (overrides: Partial<Record<string, any>> = {}) => ({
    verifySignature: jest.fn().mockResolvedValue(true),
    getFromNumber: jest.fn().mockReturnValue(CLIENT_NUMBER),
    getToNumber: jest.fn().mockReturnValue(AGENT_NUMBER),
    getSendTime: jest.fn().mockReturnValue('2026-08-17T17:00:00Z'),
    getWhatsappMessageId: jest.fn().mockReturnValue('wamid-1'),
    getWBEventType: jest.fn().mockReturnValue(WBEventTypes.MsgReceived),
    getMessageType: jest.fn().mockReturnValue(EBMessageType.Text),
    getInterpretedMessage: jest.fn().mockResolvedValue({ text: 'hola' }),
    audioSource: jest.fn(),
    imageSource: jest.fn(),
    ...overrides,
  });

  let consumer: ReturnType<typeof buildConsumer>;

  const createResponse = (rawBody?: Buffer): any => ({
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    req: { rawBody },
  });

  const body = { some: 'payload' };
  const ycloudHeaders = { 'ycloud-signature': 't=1,v1=abc' };
  const metaHeaders = { 'x-hub-signature-256': 'sha256=abc' };

  beforeEach(() => {
    // `resetAllMocks` (no solo `clearAllMocks`) es necesario: un `mockRejectedValue` o
    // `mockResolvedValueOnce` que un test deja puesto en uno de los mocks compartidos de
    // arriba sobrevive a `clearAllMocks` (que solo borra el historial de llamadas) y se
    // filtraría a los tests siguientes.
    jest.resetAllMocks();
    mockQueueService.buildWindowId.mockReturnValue('w-1');

    controller = new WhatsappConfigController(
      mockWhatsappConfigService,
      mockLogger,
      mockQueueService,
      mockCloudTasks,
      mockWebhookDedup,
      mockWorkflowsService,
      mockConversationsService,
      mockEndUsersService,
      mockPayloadConsumerResolver,
      mockMediaProcessingService,
    );

    consumer = buildConsumer();
    mockPayloadConsumerResolver.forProvider.mockResolvedValue(consumer);
    mockWebhookDedup.claim.mockResolvedValue(true);
    mockWhatsappConfigService.getWhatsappConfigByPhoneNumber.mockResolvedValue({
      id: 'wa-1',
      organizationId: 'org-1',
      isActive: true,
      approvedAt: new Date('2026-01-01'),
      defaultWorkflowId: 'wf-1',
    });
    mockWorkflowsService.getRoutingState.mockResolvedValue({ isActive: true });
    mockConversationsService.findActiveWhatsappConversation.mockResolvedValue(null);
    mockConversationsService.findOrCreateConversationFromWhatsAppMessage.mockResolvedValue({
      id: 'conv-1',
      organizationId: 'org-1',
    });
    mockEndUsersService.isBlocked.mockResolvedValue(false);
  });

  // ─── Selección de proveedor ─────────────────────────────────────────────

  describe('selección de proveedor', () => {
    it('usa el consumer de ycloud cuando llega el header ycloud-signature', async () => {
      await controller.handleWebhook(body, createResponse(Buffer.from('{}')), ycloudHeaders);

      expect(mockPayloadConsumerResolver.forProvider).toHaveBeenCalledWith('ycloud', body);
    });

    it('usa el consumer de meta cuando NO llega el header ycloud-signature', async () => {
      await controller.handleWebhook(body, createResponse(Buffer.from('{}')), metaHeaders);

      expect(mockPayloadConsumerResolver.forProvider).toHaveBeenCalledWith('meta', body);
    });

    it('también cae a meta si no llega ningún header reconocible', async () => {
      await controller.handleWebhook(body, createResponse(Buffer.from('{}')), {});

      expect(mockPayloadConsumerResolver.forProvider).toHaveBeenCalledWith('meta', body);
    });
  });

  // ─── Eventos no permitidos ──────────────────────────────────────────────

  describe('eventos no permitidos (WBEventTypes.NotAllowed)', () => {
    it('valida la firma primero y, si es válida, contesta 200 sin tocar la base', async () => {
      consumer.getWBEventType.mockReturnValue(WBEventTypes.NotAllowed);
      const res = createResponse(Buffer.from('{}'));

      await controller.handleWebhook(body, res, ycloudHeaders);

      expect(consumer.verifySignature).toHaveBeenCalledTimes(1);
      expect(mockWebhookDedup.claim).not.toHaveBeenCalled();
      expect(mockWhatsappConfigService.getWhatsappConfigByPhoneNumber).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.send).toHaveBeenCalledWith({ received: true });
    });

    it('un evento NotAllowed con firma inválida se rechaza con 401 y no se contesta 200 a ciegas', async () => {
      consumer.getWBEventType.mockReturnValue(WBEventTypes.NotAllowed);
      consumer.verifySignature.mockResolvedValue(false);
      const res = createResponse(Buffer.from('{}'));

      await controller.handleWebhook(body, res, ycloudHeaders);

      // Antes, un evento clasificado como NotAllowed contestaba 200 sin haber validado la
      // firma: un payload sin autenticar se aceptaba igual que uno legítimo mientras se
      // pudiera clasificar como "no aplica". Ahora la firma manda primero, sin excepción.
      expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(res.send).toHaveBeenCalledWith({ received: false });
    });
  });

  // ─── Verificación de firma ──────────────────────────────────────────────

  describe('verificación de firma', () => {
    it('valida por raw body cuando está disponible, sin caer al fallback', async () => {
      const res = createResponse(Buffer.from('{"a":1}'));

      await controller.handleWebhook(body, res, ycloudHeaders);

      expect(consumer.verifySignature).toHaveBeenCalledTimes(1);
      expect(consumer.verifySignature).toHaveBeenCalledWith('{"a":1}', ycloudHeaders);
    });

    it('cae al fallback de JSON.stringify si el raw body no valida', async () => {
      consumer.verifySignature.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      const res = createResponse(Buffer.from('{"a":1}'));

      await controller.handleWebhook(body, res, ycloudHeaders);

      expect(consumer.verifySignature).toHaveBeenCalledTimes(2);
      expect(consumer.verifySignature).toHaveBeenNthCalledWith(2, JSON.stringify(body), ycloudHeaders);
      expect(mockWebhookDedup.claim).toHaveBeenCalled(); // siguió el flujo normal
    });

    it('sin raw body, solo intenta el fallback de JSON.stringify (una sola llamada)', async () => {
      const res = createResponse(undefined);

      await controller.handleWebhook(body, res, ycloudHeaders);

      expect(consumer.verifySignature).toHaveBeenCalledTimes(1);
      expect(consumer.verifySignature).toHaveBeenCalledWith(JSON.stringify(body), ycloudHeaders);
    });

    it('el log de éxito refleja el proveedor real (meta), no un texto fijo de YCloud', async () => {
      const res = createResponse(Buffer.from('{}'));

      await controller.handleWebhook(body, res, metaHeaders);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('meta signature validated'));
    });

    it('rechaza con 401, desconecta la cuenta y no reclama deduplicación si ambas verificaciones fallan', async () => {
      consumer.verifySignature.mockResolvedValue(false);
      const res = createResponse(Buffer.from('{}'));

      await controller.handleWebhook(body, res, ycloudHeaders);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(res.send).toHaveBeenCalledWith({ received: false });
      expect(mockWhatsappConfigService.updateConnectionStatusByPhoneNumber).toHaveBeenCalledWith(
        AGENT_NUMBER,
        'DISCONNECTED',
      );
      expect(mockWhatsappConfigService.updateConnectionErrorByPhoneNumber).toHaveBeenCalledWith(
        AGENT_NUMBER,
        'Invalid signature, contact Support Service',
      );
      expect(mockWebhookDedup.claim).not.toHaveBeenCalled();
    });

    it('con un echo, la firma inválida desconecta el número del NEGOCIO (from), no el del cliente', async () => {
      consumer.verifySignature.mockResolvedValue(false);
      consumer.getWBEventType.mockReturnValue(WBEventTypes.MsgEchoes);
      consumer.getFromNumber.mockReturnValue(AGENT_NUMBER);
      consumer.getToNumber.mockReturnValue(CLIENT_NUMBER);

      await controller.handleWebhook(body, createResponse(Buffer.from('{}')), ycloudHeaders);

      expect(mockWhatsappConfigService.updateConnectionStatusByPhoneNumber).toHaveBeenCalledWith(
        AGENT_NUMBER,
        'DISCONNECTED',
      );
    });
  });

  // ─── Mensaje sin ID ──────────────────────────────────────────────────────

  it('un mensaje sin whatsappMessageId se descarta con 200 antes de deduplicar', async () => {
    consumer.getWhatsappMessageId.mockReturnValue('');
    const res = createResponse(Buffer.from('{}'));

    await controller.handleWebhook(body, res, ycloudHeaders);

    expect(mockWebhookDedup.claim).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith({ received: true });
  });

  // ─── Deduplicación ───────────────────────────────────────────────────────

  describe('deduplicación', () => {
    it('descarta un mensaje duplicado sin tocar la cuenta', async () => {
      mockWebhookDedup.claim.mockResolvedValue(false);
      const res = createResponse(Buffer.from('{}'));

      await controller.handleWebhook(body, res, ycloudHeaders);

      expect(mockWhatsappConfigService.getWhatsappConfigByPhoneNumber).not.toHaveBeenCalled();
      expect(res.send).toHaveBeenCalledWith({ received: true, duplicate: true });
    });

    it('reclama y libera bajo el proveedor REAL del webhook (meta), no un valor fijo', async () => {
      mockCloudTasks.enqueue.mockRejectedValue(new Error('tasks down'));
      const res = createResponse(Buffer.from('{}'));

      await controller.handleWebhook(body, res, metaHeaders); // sin ycloud-signature ⇒ va por meta

      expect(mockPayloadConsumerResolver.forProvider).toHaveBeenCalledWith('meta', body);
      expect(mockWebhookDedup.claim).toHaveBeenCalledWith('meta', 'wamid-1', EBMessageType.Text);
      expect(mockWebhookDedup.release).toHaveBeenCalledWith('meta', 'wamid-1');
    });
  });

  // ─── Resolución de la cuenta ─────────────────────────────────────────────

  describe('resolución de la cuenta', () => {
    it('descarta sin reintentar si no hay config para el número', async () => {
      mockWhatsappConfigService.getWhatsappConfigByPhoneNumber.mockResolvedValue(null);
      const res = createResponse(Buffer.from('{}'));

      await controller.handleWebhook(body, res, ycloudHeaders);

      expect(res.send).toHaveBeenCalledWith({ received: true, ignored: 'unknown-config' });
      expect(mockWebhookDedup.release).not.toHaveBeenCalled();
    });

    it('descarta sin reintentar si la config está inactiva', async () => {
      mockWhatsappConfigService.getWhatsappConfigByPhoneNumber.mockResolvedValue({
        id: 'wa-1',
        organizationId: 'org-1',
        isActive: false,
        defaultWorkflowId: 'wf-1',
      });

      await controller.handleWebhook(body, createResponse(Buffer.from('{}')), ycloudHeaders);

      expect(mockEndUsersService.isBlocked).not.toHaveBeenCalled();
    });

    it('descarta sin reintentar si la config no tiene workflow asignado', async () => {
      mockWhatsappConfigService.getWhatsappConfigByPhoneNumber.mockResolvedValue({
        id: 'wa-1',
        organizationId: 'org-1',
        isActive: true,
        approvedAt: new Date('2026-01-01'),
        defaultWorkflowId: null,
      });
      const res = createResponse(Buffer.from('{}'));

      await controller.handleWebhook(body, res, ycloudHeaders);

      expect(res.send).toHaveBeenCalledWith({ received: true, ignored: 'no-workflow' });
    });
  });

  // ─── Lista negra ─────────────────────────────────────────────────────────

  describe('lista negra', () => {
    it('descarta un mensaje entrante de un contacto bloqueado', async () => {
      mockEndUsersService.isBlocked.mockResolvedValue(true);
      const res = createResponse(Buffer.from('{}'));

      await controller.handleWebhook(body, res, ycloudHeaders);

      expect(mockQueueService.bufferMessage).not.toHaveBeenCalled();
      expect(mockCloudTasks.enqueue).not.toHaveBeenCalled();
      expect(res.send).toHaveBeenCalledWith({ received: true, ignored: 'blocked-contact' });
    });

    it('consulta el bloqueo con el número del CLIENTE, no el del negocio', async () => {
      mockEndUsersService.isBlocked.mockResolvedValue(true);

      await controller.handleWebhook(body, createResponse(Buffer.from('{}')), ycloudHeaders);

      expect(mockEndUsersService.isBlocked).toHaveBeenCalledWith('org-1', { phoneNumber: CLIENT_NUMBER });
    });

    it('no aplica la lista negra a los echoes del propio negocio', async () => {
      consumer.getWBEventType.mockReturnValue(WBEventTypes.MsgEchoes);
      consumer.getFromNumber.mockReturnValue(AGENT_NUMBER);
      consumer.getToNumber.mockReturnValue(CLIENT_NUMBER);
      mockEndUsersService.isBlocked.mockResolvedValue(true);

      await controller.handleWebhook(body, createResponse(Buffer.from('{}')), ycloudHeaders);

      expect(mockEndUsersService.isBlocked).not.toHaveBeenCalled();
    });
  });

  it('descarta los mensajes a un número que un super admin no ha aprobado', async () => {
    mockWhatsappConfigService.getWhatsappConfigByPhoneNumber.mockResolvedValue({
      id: 'wa-1',
      organizationId: 'org-1',
      isActive: true,
      approvedAt: null,
      defaultWorkflowId: 'wf-1',
    });
    const res = createResponse(Buffer.from('{}'));

    await controller.handleWebhook(body, res, ycloudHeaders);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ ignored: 'unapproved-config' }),
    );
    expect(mockQueueService.bufferMessage).not.toHaveBeenCalled();
    expect(mockCloudTasks.enqueue).not.toHaveBeenCalled();
  });

  it('no consulta la lista negra si la firma no es válida', async () => {
    consumer.verifySignature.mockResolvedValue(false);
    const res = createResponse(Buffer.from('{}'));

    await controller.handleWebhook(body, res, ycloudHeaders);

    // La firma manda: un POST sin autenticar no debe poder sondear qué números están bloqueados.
    expect(mockEndUsersService.isBlocked).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
  });

  describe('estado del workflow', () => {
    it('descarta sin reintentar si el workflow ya no existe (borrado o de otra organización)', async () => {
      mockWorkflowsService.getRoutingState.mockResolvedValue(null);
      const res = createResponse(Buffer.from('{}'));

      await controller.handleWebhook(body, res, ycloudHeaders);

      expect(res.send).toHaveBeenCalledWith({ received: true, ignored: 'missing-workflow' });
      expect(mockWebhookDedup.release).not.toHaveBeenCalled();
    });

    it('con el workflow apagado, registra el mensaje del cliente como USER antes de descartar', async () => {
      mockWorkflowsService.getRoutingState.mockResolvedValue({ isActive: false });
      const res = createResponse(Buffer.from('{}'));

      await controller.handleWebhook(body, res, ycloudHeaders);

      expect(mockConversationsService.addMessage).toHaveBeenCalledWith(
        'conv-1',
        ChatRole.USER,
        'hola',
        expect.objectContaining({ source: 'whatsapp_inbound_message' }),
      );
      expect(res.send).toHaveBeenCalledWith({ received: true, ignored: 'inactive-workflow' });
    });

    it('con el workflow apagado y sin texto interpretable, no escribe un mensaje vacío', async () => {
      mockWorkflowsService.getRoutingState.mockResolvedValue({ isActive: false });
      consumer.getInterpretedMessage.mockResolvedValue({});

      await controller.handleWebhook(body, createResponse(Buffer.from('{}')), ycloudHeaders);

      expect(mockConversationsService.addMessage).not.toHaveBeenCalled();
    });
    // Un echo nunca llega a esta rama: siempre se resuelve antes, en el bloque de "lista
    // negra" (que para un echo consulta HITL en vez de bloqueo — ver más abajo, "echoes
    // con el workflow activo"), así que no hay un caso de echo + workflow inactivo que
    // probar aquí.
  });

  // ─── Echoes con workflow activo ──────────────────────────────────────────

  describe('echoes con el workflow activo', () => {
    beforeEach(() => {
      consumer.getWBEventType.mockReturnValue(WBEventTypes.MsgEchoes);
      consumer.getFromNumber.mockReturnValue(AGENT_NUMBER);
      consumer.getToNumber.mockReturnValue(CLIENT_NUMBER);
    });

    it('no registra nada si nadie intervino la conversación', async () => {
      mockConversationsService.findActiveWhatsappConversation.mockResolvedValue({
        id: 'conv-1',
        organizationId: 'org-1',
        isHumanInTheLoop: false,
      });
      const res = createResponse(Buffer.from('{}'));

      await controller.handleWebhook(body, res, ycloudHeaders);

      expect(mockConversationsService.addMessage).not.toHaveBeenCalled();
      expect(mockQueueService.bufferMessage).not.toHaveBeenCalled();
      expect(res.send).toHaveBeenCalledWith({ received: true });
    });

    it('registra el echo como ASSISTANT cuando un humano intervino, reusando la conversación ya consultada', async () => {
      mockConversationsService.findActiveWhatsappConversation.mockResolvedValue({
        id: 'conv-1',
        organizationId: 'org-1',
        isHumanInTheLoop: true,
      });

      await controller.handleWebhook(body, createResponse(Buffer.from('{}')), ycloudHeaders);

      expect(mockConversationsService.findActiveWhatsappConversation).toHaveBeenCalledTimes(1);
      expect(mockConversationsService.addMessage).toHaveBeenCalledWith(
        'conv-1',
        ChatRole.ASSISTANT,
        'hola',
        expect.objectContaining({ source: 'whatsapp_smb_echo' }),
      );
      expect(mockConversationsService.markMessageOutsideWorkflow).toHaveBeenCalledWith(
        'org-1',
        'conv-1',
        'human-in-the-loop',
        undefined,
      );
    });

    it('nunca bufferea el echo ni agenda una tarea, con o sin intervención humana', async () => {
      mockConversationsService.findActiveWhatsappConversation.mockResolvedValue({
        id: 'conv-1',
        organizationId: 'org-1',
        isHumanInTheLoop: true,
      });

      await controller.handleWebhook(body, createResponse(Buffer.from('{}')), ycloudHeaders);

      expect(mockQueueService.bufferMessage).not.toHaveBeenCalled();
      expect(mockCloudTasks.enqueue).not.toHaveBeenCalled();
    });
  });

  // ─── Mensajes entrantes normales ─────────────────────────────────────────

  describe('mensajes entrantes normales', () => {
    it('bufferea el mensaje y agenda el worker con los números correctos', async () => {
      const res = createResponse(Buffer.from('{}'));

      await controller.handleWebhook(body, res, ycloudHeaders);

      expect(mockQueueService.bufferMessage).toHaveBeenCalledWith(
        'org-1',
        AGENT_NUMBER,
        CLIENT_NUMBER,
        expect.objectContaining({
          messageId: 'wamid-1',
          sendTime: '2026-08-17T17:00:00Z',
          event: body,
        }),
      );
      expect(mockCloudTasks.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            organizationId: 'org-1',
            agentPhoneNumber: AGENT_NUMBER,
            clientPhoneNumber: CLIENT_NUMBER,
            windowId: 'w-1',
          }),
        }),
      );
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.send).toHaveBeenCalledWith({ received: true });
    });

    it('un mensaje de Meta se bufferea igual que uno de YCloud, sin distinción en el worker', async () => {
      const res = createResponse(Buffer.from('{}'));

      await controller.handleWebhook(body, res, metaHeaders);

      expect(mockQueueService.bufferMessage).toHaveBeenCalledTimes(1);
      expect(mockCloudTasks.enqueue).toHaveBeenCalledTimes(1);
      expect(res.send).toHaveBeenCalledWith({ received: true });
    });
  });

  // ─── Manejo de errores dentro del bloque protegido ──────────────────────

  describe('errores durante el procesamiento (dentro del try/catch)', () => {
    it('libera la deduplicación y contesta 500 si falla encolar la tarea, para que el proveedor reintente', async () => {
      mockCloudTasks.enqueue.mockRejectedValue(new Error('tasks down'));
      const res = createResponse(Buffer.from('{}'));

      await controller.handleWebhook(body, res, ycloudHeaders);

      expect(mockWebhookDedup.release).toHaveBeenCalledWith('ycloud', 'wamid-1');
      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(res.send).toHaveBeenCalledWith({ received: false });
    });

    it('libera la deduplicación y contesta 500 si falla interpretar el mensaje (p.ej. transcripción)', async () => {
      // El flujo normal ya no interpreta el mensaje aquí (eso lo hace el worker, fuera del
      // ciclo del webhook): la única rama de este controller que sí llama a
      // `getInterpretedMessage` es la que registra el mensaje fuera del flujo, por ejemplo
      // con el workflow apagado.
      mockWorkflowsService.getRoutingState.mockResolvedValue({ isActive: false });
      consumer.getInterpretedMessage.mockRejectedValue(new Error('STT caído'));
      const res = createResponse(Buffer.from('{}'));

      await controller.handleWebhook(body, res, ycloudHeaders);

      expect(mockWebhookDedup.release).toHaveBeenCalledWith('ycloud', 'wamid-1');
      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('libera la deduplicación y contesta 500 si falla resolver el estado del workflow por una causa real (no "no existe")', async () => {
      mockWorkflowsService.getRoutingState.mockRejectedValue(new Error('connection terminated'));
      const res = createResponse(Buffer.from('{}'));

      await controller.handleWebhook(body, res, ycloudHeaders);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockWebhookDedup.release).toHaveBeenCalled();
    });

    it('no deja el número del cliente en claro en los logs de error', async () => {
      mockCloudTasks.enqueue.mockRejectedValue(new Error('tasks down'));

      await controller.handleWebhook(body, createResponse(Buffer.from('{}')), ycloudHeaders);

      const logged = JSON.stringify(mockLogger.error.mock.calls);
      expect(logged).not.toContain(CLIENT_NUMBER);
    });
  });

  // ─── Fallos ANTES del bloque protegido ──────────────────────────────────

  describe('errores en cualquier punto del webhook, incluso antes de conocer el whatsappMessageId', () => {
    it('si el resolver de proveedor falla, contesta 500 igual que un fallo más adelante en el proceso (antes: la promesa se rechazaba sin responder nada)', async () => {
      mockPayloadConsumerResolver.forProvider.mockRejectedValue(new Error('payload corrupto'));
      const res = createResponse(Buffer.from('{}'));

      await controller.handleWebhook(body, res, ycloudHeaders);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(res.send).toHaveBeenCalledWith({ received: false });
      // Nunca se llegó a conocer el whatsappMessageId: no hay ningún claim que liberar.
      expect(mockWebhookDedup.release).not.toHaveBeenCalled();
    });

    it('si un getter del consumer (p.ej. getWhatsappMessageId) falla, también contesta 500 en vez de tirar la request', async () => {
      consumer.getWhatsappMessageId.mockImplementation(() => {
        throw new Error('payload sin id');
      });
      const res = createResponse(Buffer.from('{}'));

      await controller.handleWebhook(body, res, ycloudHeaders);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(res.send).toHaveBeenCalledWith({ received: false });
    });

    it('si verifySignature en sí falla (no solo devuelve false), contesta 500 en vez de 401', async () => {
      consumer.verifySignature.mockRejectedValue(new Error('secret no configurado'));
      const res = createResponse(Buffer.from('{}'));

      await controller.handleWebhook(body, res, ycloudHeaders);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(res.send).toHaveBeenCalledWith({ received: false });
    });

    it('si ya se conocía el whatsappMessageId cuando ocurrió el fallo, sí libera el claim correspondiente', async () => {
      mockCloudTasks.enqueue.mockRejectedValue(new Error('tasks down'));
      const res = createResponse(Buffer.from('{}'));

      await controller.handleWebhook(body, res, ycloudHeaders);

      expect(mockWebhookDedup.release).toHaveBeenCalledWith('ycloud', 'wamid-1');
    });
  });
});

/**
 * Las rutas de gestión reciben ids en la URL. Un número o template de otra organización tiene
 * que contestarse como inexistente y, sobre todo, no llegar al servicio que escribe o envía.
 */
describe('WhatsappConfigController · gestión', () => {
  const ORG = 'org-1';
  const currUser: any = { organizationId: ORG, role: UserRole.ADMIN };
  const ownConfig = {
    id: 'wa-1',
    organizationId: ORG,
    phoneNumber: '5211111111111',
    approvedAt: new Date('2026-01-01'),
  };
  const foreignConfig = { id: 'wa-9', organizationId: 'org-9', phoneNumber: '5219999999999' };

  const service: any = {
    getWhatsappConfigById: jest.fn(),
    getTemplate: jest.fn(),
    deleteRecord: jest.fn(),
    updateIsActive: jest.fn(),
    createTemplate: jest.fn(),
    listTemplates: jest.fn(),
    updateTemplate: jest.fn(),
    deleteTemplate: jest.fn(),
    sendTemplateMessage: jest.fn(),
  };
  const controller = new WhatsappConfigController(
    service,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  const res = () => {
    const r: any = {};
    r.status = jest.fn().mockReturnValue(r);
    r.json = jest.fn().mockReturnValue(r);
    return r;
  };

  beforeEach(() => {
    // `clearAllMocks` no basta: `jest.resetAllMocks()` en el describe de `handleWebhook` de
    // arriba opera sobre el registro global de mocks de Jest (compartido por todo el
    // archivo, no por describe), y ya para cuando corren estos tests borró la implementación
    // que estos mocks traían de fábrica. Se re-arma aquí para que este describe no dependa
    // del orden de ejecución de los demás.
    jest.clearAllMocks();
    service.getWhatsappConfigById.mockImplementation((id: string) =>
      Promise.resolve(
        id === ownConfig.id ? ownConfig : id === foreignConfig.id ? foreignConfig : null,
      ),
    );
    service.deleteRecord.mockResolvedValue(true);
    service.updateIsActive.mockResolvedValue(true);
    service.listTemplates.mockResolvedValue([]);
    service.deleteTemplate.mockResolvedValue(true);
  });

  it('no borra ni apaga un número de otra organización', async () => {
    const r1 = res();
    await controller.deleteConfig(currUser, foreignConfig.id, r1);
    const r2 = res();
    await controller.setIsActive(currUser, foreignConfig.id, false, r2);

    expect(r1.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(r2.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(service.deleteRecord).not.toHaveBeenCalled();
    expect(service.updateIsActive).not.toHaveBeenCalled();
  });

  it('borra un número propio', async () => {
    const r = res();
    await controller.deleteConfig(currUser, ownConfig.id, r);
    expect(service.deleteRecord).toHaveBeenCalledWith(ownConfig.id);
    expect(r.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  it('no crea ni lista templates en un número ajeno', async () => {
    await controller.createTemplate(currUser, foreignConfig.id, { name: 'x' }, res());
    await controller.listTemplates(currUser, foreignConfig.id, res());
    expect(service.createTemplate).not.toHaveBeenCalled();
    expect(service.listTemplates).not.toHaveBeenCalled();
  });

  it('no envía, edita ni borra un template cuyo número es de otra organización', async () => {
    service.getTemplate.mockResolvedValue({
      id: 'tpl-9',
      whatsAppConfigId: foreignConfig.id,
      name: 'promo',
      language: 'es_MX',
    });

    const r = res();
    await controller.sendTemplate(currUser, 'tpl-9', { to: '5215500000000' } as any, r);
    await controller.updateTemplate(currUser, 'tpl-9', { name: 'y' }, res());
    await controller.deleteTemplate(currUser, 'tpl-9', res());

    expect(r.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(service.sendTemplateMessage).not.toHaveBeenCalled();
    expect(service.updateTemplate).not.toHaveBeenCalled();
    expect(service.deleteTemplate).not.toHaveBeenCalled();
  });

  it('envía un template propio desde el número al que pertenece', async () => {
    service.getTemplate.mockResolvedValue({
      id: 'tpl-1',
      whatsAppConfigId: ownConfig.id,
      name: 'promo',
      language: 'es_MX',
    });

    await controller.sendTemplate(currUser, 'tpl-1', { to: '5215500000000' } as any, res());

    expect(service.sendTemplateMessage).toHaveBeenCalledWith(
      ownConfig.phoneNumber,
      '5215500000000',
      'promo',
      'es_MX',
      undefined,
    );
  });

  it('no envía templates desde un número propio que sigue pendiente', async () => {
    service.getWhatsappConfigById.mockResolvedValueOnce({ ...ownConfig, approvedAt: null });
    service.getTemplate.mockResolvedValue({
      id: 'tpl-1',
      whatsAppConfigId: ownConfig.id,
      name: 'promo',
      language: 'es_MX',
    });
    const r = res();

    await controller.sendTemplate(currUser, 'tpl-1', { to: '5215500000000' } as any, r);

    expect(r.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(service.sendTemplateMessage).not.toHaveBeenCalled();
  });

  // Un VIEWER solo consulta: las escrituras exigen OWNER/ADMIN.
  it.each([
    'createConfig',
    'deleteConfig',
    'updateConfig',
    'setIsActive',
    'createTemplate',
    'updateTemplate',
    'deleteTemplate',
    'sendTemplate',
  ])('%s queda fuera de VIEWER', (handler) => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      (WhatsappConfigController.prototype as any)[handler],
    );
    expect(roles).toEqual([UserRole.OWNER, UserRole.ADMIN]);
  });

  it.each(['listConfigsByOrgAndWorkflow', 'listTemplates'])('%s admite VIEWER', (handler) => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      (WhatsappConfigController.prototype as any)[handler],
    );
    expect(roles).toContain(UserRole.VIEWER);
  });
});
