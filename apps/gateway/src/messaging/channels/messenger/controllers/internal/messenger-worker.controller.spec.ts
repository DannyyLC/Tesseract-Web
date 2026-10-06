import { MessengerConnectionStatus } from '@tesseract/database';
import { MessengerWorkerController } from './messenger-worker.controller';

/**
 * Por ahora cubre solo el acuse: `mark_seen` + `typing_on` salen hacia el cliente antes de
 * ejecutar el workflow, salvo que el workflow los apague con `presenceIndicators: false`.
 */
describe('MessengerWorkerController', () => {
  let controller: MessengerWorkerController;

  const mockMessengerConfigService: any = {
    getMessengerConfigByPageId: jest.fn(),
    markSeenAndSendTypingIndicator: jest.fn(),
    sendTextMessage: jest.fn(),
    updateConnectionStatus: jest.fn(),
    handleActionsDerivatedFromMetadata: jest.fn(),
  };
  const mockLogger: any = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
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
    findOne: jest.fn(),
    findActiveMessengerConversation: jest.fn(),
    findOrCreateConversationFromMessengerMessage: jest.fn(),
    addMessage: jest.fn(),
    update: jest.fn(),
  };
  const mockCloudTasks: any = { enqueue: jest.fn() };

  const body = { organizationId: 'org-1', pageId: 'page-1', senderId: 'psid-1', windowId: 'w-1' };
  const account = {
    id: 'ms-1',
    isActive: true,
    defaultWorkflowId: 'wf-1',
    connectionStatus: MessengerConnectionStatus.CONNECTED,
  };

  const buildResponse = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
  };

  const withPresence = (presenceIndicators: boolean) =>
    mockWorkflowsService.getChannelPolicy.mockResolvedValue({
      mediaPolicy: {
        audio: { enabled: false, maxSeconds: 120 },
        image: { enabled: false, maxBytes: 1000 },
        video: { enabled: false },
        messages: { unsupportedFormat: 'formato no soportado' },
      },
      presenceIndicators,
    });

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new MessengerWorkerController(
      mockMessengerConfigService,
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
      messages: [
        {
          messageId: 'm-1',
          bufferedAt: Date.now(),
          event: { messaging: { message: { text: 'hola' } } },
        },
      ],
      processingKey: 'proc-1',
    });
    mockMessengerConfigService.getMessengerConfigByPageId.mockResolvedValue(account);
    mockWorkflowsService.execute.mockResolvedValue({
      id: 'exec-1',
      result: {
        messages: [{ role: 'assistant', content: 'Claro, te ayudo.' }],
        conversationId: 'conv-1',
      },
    });
    mockConversationsService.findOne.mockResolvedValue({ id: 'conv-1', metadata: {} });
    mockConversationsService.findActiveMessengerConversation.mockResolvedValue({
      id: 'conv-1',
      organizationId: 'org-1',
      isHumanInTheLoop: false,
    });
  });

  const withStickerOnly = () =>
    mockQueueService.drainWindow.mockResolvedValue({
      messages: [
        {
          messageId: 'm-1',
          bufferedAt: Date.now(),
          event: { messaging: { message: { attachments: [{ type: 'location' }] } } },
        },
      ],
      processingKey: 'proc-1',
    });

  it('con la conversación intervenida no manda nada: ni visto, ni respuesta, ni fallback', async () => {
    withPresence(true);
    mockConversationsService.findActiveMessengerConversation.mockResolvedValue({
      id: 'conv-1',
      organizationId: 'org-1',
      isHumanInTheLoop: true,
    });
    mockWorkflowsService.execute.mockResolvedValue({
      id: 'exec-1',
      result: { messages: [], skipped: 'hitl', conversationId: 'conv-1' },
    });
    const res = buildResponse();

    await controller.processWindow(body, res);

    expect(mockMessengerConfigService.markSeenAndSendTypingIndicator).not.toHaveBeenCalled();
    expect(mockMessengerConfigService.sendTextMessage).not.toHaveBeenCalled();
    expect(mockQueueService.commitWindow).toHaveBeenCalledWith('proc-1');
    expect(res.send).toHaveBeenCalledWith({ processed: false, reason: 'hitl' });
  });

  it('un adjunto sin texto se guarda como marcador junto con el aviso, sin ejecutar', async () => {
    withPresence(true);
    withStickerOnly();

    await controller.processWindow(body, buildResponse());

    expect(mockWorkflowsService.execute).not.toHaveBeenCalled();
    expect(mockConversationsService.addMessage).toHaveBeenNthCalledWith(
      1,
      'conv-1',
      'USER',
      '[Ubicación]',
      { source: 'unprocessed_media' },
    );
    expect(mockConversationsService.addMessage).toHaveBeenNthCalledWith(
      2,
      'conv-1',
      'ASSISTANT',
      'formato no soportado',
      { source: 'media_notice' },
    );
    expect(mockConversationsService.update).toHaveBeenCalledWith('org-1', 'conv-1', {
      messageCount: { increment: 2 },
    });
  });

  it('intervenida, el adjunto sin texto se guarda pero no se avisa al cliente', async () => {
    withPresence(true);
    withStickerOnly();
    mockConversationsService.findActiveMessengerConversation.mockResolvedValue({
      id: 'conv-1',
      organizationId: 'org-1',
      isHumanInTheLoop: true,
    });

    await controller.processWindow(body, buildResponse());

    expect(mockMessengerConfigService.sendTextMessage).not.toHaveBeenCalled();
    expect(mockConversationsService.addMessage).toHaveBeenCalledTimes(1);
    expect(mockConversationsService.addMessage).toHaveBeenCalledWith(
      'conv-1',
      'USER',
      '[Ubicación]',
      { source: 'unprocessed_media' },
    );
  });

  it('marca como leído y muestra escribiendo por defecto', async () => {
    withPresence(true);

    await controller.processWindow(body, buildResponse());

    expect(mockMessengerConfigService.markSeenAndSendTypingIndicator).toHaveBeenCalledWith(
      account,
      body.senderId,
    );
    expect(mockMessengerConfigService.sendTextMessage).toHaveBeenCalledWith(
      account,
      body.senderId,
      'Claro, te ayudo.',
    );
  });

  it('con presenceIndicators apagado responde igual pero sin visto ni escribiendo', async () => {
    withPresence(false);

    await controller.processWindow(body, buildResponse());

    expect(mockMessengerConfigService.markSeenAndSendTypingIndicator).not.toHaveBeenCalled();
    expect(mockWorkflowsService.execute).toHaveBeenCalled();
    expect(mockMessengerConfigService.sendTextMessage).toHaveBeenCalledWith(
      account,
      body.senderId,
      'Claro, te ayudo.',
    );
  });

  it('con otro turno en curso reagenda sin tocar el buffer ni ejecutar', async () => {
    withPresence(true);
    mockQueueService.acquireTurn.mockResolvedValue({ acquired: false, token: null });
    const res = buildResponse();

    await controller.processWindow(body, res);

    expect(mockQueueService.drainWindow).not.toHaveBeenCalled();
    expect(mockWorkflowsService.execute).not.toHaveBeenCalled();
    expect(mockQueueService.releaseTurn).not.toHaveBeenCalled();
    expect(mockCloudTasks.enqueue).toHaveBeenCalledTimes(1);
    expect(res.send).toHaveBeenCalledWith({ processed: false, reason: 'busy', extension: 1 });
  });

  it('suelta su turno antes de contestarle a Cloud Tasks', async () => {
    withPresence(true);
    const res = buildResponse();

    await controller.processWindow(body, res);

    expect(mockQueueService.releaseTurn).toHaveBeenCalledWith(
      body.organizationId,
      body.pageId,
      body.senderId,
      'tok-1',
    );
    expect(mockQueueService.releaseTurn.mock.invocationCallOrder[0]).toBeLessThan(
      res.status.mock.invocationCallOrder[0],
    );
  });
});
