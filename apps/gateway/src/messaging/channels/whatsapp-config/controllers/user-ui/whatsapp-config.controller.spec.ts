import { HttpStatus } from '@nestjs/common';
import { WhatsappConfigController } from './whatsapp-config.controller';

/**
 * El foco de estas pruebas es la lista negra en el webhook.
 *
 * Lo que se verifica no es solo que se conteste 200: es que un contacto bloqueado NO llegue a
 * gastar nada. Si alguna de estas aserciones se cae, la feature dejó de cumplir lo único que
 * prometía —no quemar recursos en quien ya está bloqueado— aunque en la UI se siga viendo el
 * candado.
 */
describe('WhatsappConfigController · webhook', () => {
  let controller: WhatsappConfigController;

  const mockWhatsappConfigService: any = {
    verifySignature: jest.fn(),
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
  };
  const mockEndUsersService: any = { isBlocked: jest.fn() };

  const USER_NUMBER = '5215512345678';
  const PHONE_NUMBER = '5211111111111';

  const body = {
    type: 'whatsapp.inbound_message.received',
    whatsappInboundMessage: {
      id: 'wamid-1',
      type: 'text',
      from: USER_NUMBER,
      to: PHONE_NUMBER,
      text: { body: 'hola' },
      sendTime: '2026-08-17T17:00:00Z',
    },
  };

  /** Mensaje que el negocio mandó desde su propia app: `from`/`to` van al revés. */
  const echoBody = {
    type: 'whatsapp.smb.message.echoes',
    whatsappMessage: {
      id: 'wamid-echo-1',
      type: 'text',
      from: PHONE_NUMBER,
      to: USER_NUMBER,
      text: { body: 'ya no me escribas' },
    },
  };

  const createMockResponse = () => {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      req: {},
    };
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new WhatsappConfigController(
      mockWhatsappConfigService,
      mockLogger,
      mockQueueService,
      mockCloudTasks,
      mockWebhookDedup,
      mockWorkflowsService,
      mockConversationsService,
      mockEndUsersService,
    );

    mockWhatsappConfigService.verifySignature.mockReturnValue(true);
    mockWhatsappConfigService.getWhatsappConfigByPhoneNumber.mockResolvedValue({
      id: 'wa-1',
      organizationId: 'org-1',
      isActive: true,
      defaultWorkflowId: 'wf-1',
    });
    mockWebhookDedup.claim.mockResolvedValue(true);
    mockWorkflowsService.getRoutingState.mockResolvedValue({ isActive: true });
    mockConversationsService.findActiveWhatsappConversation.mockResolvedValue(null);
    mockConversationsService.findOrCreateConversationFromWhatsAppMessage.mockResolvedValue({
      id: 'conv-1',
    });
    mockEndUsersService.isBlocked.mockResolvedValue(false);
  });

  it('encola el mensaje de un contacto que no está bloqueado', async () => {
    const res = createMockResponse();

    await controller.handleWebhook(body, res, {});

    expect(mockQueueService.bufferMessage).toHaveBeenCalledTimes(1);
    expect(mockCloudTasks.enqueue).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.send).toHaveBeenCalledWith({ received: true });
  });

  describe('con el contacto bloqueado', () => {
    beforeEach(() => {
      mockEndUsersService.isBlocked.mockResolvedValue(true);
    });

    it('descarta el mensaje sin bufferear ni agendar nada', async () => {
      const res = createMockResponse();

      await controller.handleWebhook(body, res, {});

      // El corazón de la feature: ni Redis, ni Cloud Tasks. Sin tarea no hay worker, y sin
      // worker no hay palomita azul, ni transcripción, ni ejecución, ni crédito cobrado.
      expect(mockQueueService.bufferMessage).not.toHaveBeenCalled();
      expect(mockCloudTasks.enqueue).not.toHaveBeenCalled();

      // 200 y no 5xx: YCloud no debe reintentar algo que se descartó a propósito.
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.send).toHaveBeenCalledWith({ received: true, ignored: 'blocked-contact' });
    });

    it('busca el bloqueo por la organización de la cuenta y el número tal como llega', async () => {
      const res = createMockResponse();

      await controller.handleWebhook(body, res, {});

      // El número va crudo: así lo guarda el upsert del EndUser, y por eso el match es exacto.
      expect(mockEndUsersService.isBlocked).toHaveBeenCalledWith('org-1', {
        phoneNumber: USER_NUMBER,
      });
    });

    it('no deja el número del cliente en claro en los logs', async () => {
      const res = createMockResponse();

      await controller.handleWebhook(body, res, {});

      const logged = JSON.stringify(mockLogger.info.mock.calls);
      expect(logged).not.toContain(USER_NUMBER);
    });

    /**
     * Con el workflow apagado sí se registra el mensaje —nadie más lleva la conversación al
     * día— pero el bloqueo gana: es una decisión sobre la persona y vale sea cual sea el estado
     * del flujo. Si esta prueba se cae, un bloqueado acumula historial cada vez que alguien
     * apaga el workflow, que es justo lo que el bloqueo venía a evitar.
     */
    it('tampoco guarda el mensaje cuando además el workflow está apagado', async () => {
      mockWorkflowsService.getRoutingState.mockResolvedValue({ isActive: false });
      const res = createMockResponse();

      await controller.handleWebhook(body, res, {});

      expect(mockConversationsService.addMessage).not.toHaveBeenCalled();
      expect(res.send).toHaveBeenCalledWith({ received: true, ignored: 'blocked-contact' });
    });

    /**
     * La lista negra es sobre lo que ENTRA. Un echo es un mensaje que el negocio decidió mandar
     * desde su propio teléfono: bloquear a alguien no puede borrar el rastro de lo que el propio
     * tenant le escribió.
     */
    it('no filtra los echoes del negocio', async () => {
      mockWorkflowsService.getRoutingState.mockResolvedValue({ isActive: false });
      const res = createMockResponse();

      await controller.handleWebhook(echoBody, res, {});

      expect(mockEndUsersService.isBlocked).not.toHaveBeenCalled();
      expect(mockConversationsService.addMessage).toHaveBeenCalled();
    });
  });

  /**
   * Una config que apunta a un workflow borrado es un estado de configuración, no una falla
   * transitoria: reintentar no lo resucita. En su día esto contestaba 500 y cada mensaje entrante
   * de ese número se convertía en un ciclo de reintentos de YCloud.
   */
  describe('cuando el workflow ya no existe', () => {
    beforeEach(() => {
      // `getRoutingState` devuelve null cuando no hay a dónde rutear: borrado, de otra
      // organización o interno.
      mockWorkflowsService.getRoutingState.mockResolvedValue(null);
    });

    it('lo descarta con 200 en vez de pedir reintento', async () => {
      const res = createMockResponse();

      await controller.handleWebhook(body, res, {});

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.send).toHaveBeenCalledWith({ received: true, ignored: 'missing-workflow' });
      expect(res.status).not.toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('no bufferea, no agenda y conserva el claim de deduplicación', async () => {
      const res = createMockResponse();

      await controller.handleWebhook(body, res, {});

      expect(mockQueueService.bufferMessage).not.toHaveBeenCalled();
      expect(mockCloudTasks.enqueue).not.toHaveBeenCalled();
      // Liberar el claim es lo que habilita el reintento; en un descarte deliberado se queda.
      expect(mockWebhookDedup.release).not.toHaveBeenCalled();
    });
  });

  /**
   * La contracara: un fallo real de infraestructura sí merece reintento. Si la guarda se tragara
   * cualquier excepción, una caída de la base descartaría mensajes del cliente en silencio.
   */
  it('sigue devolviendo 500 si el workflow no se pudo resolver por otra causa', async () => {
    mockWorkflowsService.getRoutingState.mockRejectedValue(new Error('connection terminated'));
    const res = createMockResponse();

    await controller.handleWebhook(body, res, {});

    expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockWebhookDedup.release).toHaveBeenCalled();
  });

  it('no consulta la lista negra si la firma no es válida', async () => {
    mockWhatsappConfigService.verifySignature.mockReturnValue(false);
    const res = createMockResponse();

    await controller.handleWebhook(body, res, {});

    // La firma manda: un POST sin autenticar no debe poder sondear qué números están bloqueados.
    expect(mockEndUsersService.isBlocked).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
  });
});
