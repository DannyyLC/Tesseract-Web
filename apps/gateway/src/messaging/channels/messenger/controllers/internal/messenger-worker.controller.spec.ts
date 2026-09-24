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
  };
  const mockMediaProcessingService: any = { processIncomingAttachments: jest.fn() };
  const mockConversationsService: any = { findOne: jest.fn() };
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
    mockQueueService.drainWindow.mockResolvedValue({
      messages: [{ messageId: 'm-1', bufferedAt: Date.now(), event: { messaging: { message: { text: 'hola' } } } }],
      processingKey: 'proc-1',
    });
    mockMessengerConfigService.getMessengerConfigByPageId.mockResolvedValue(account);
    mockWorkflowsService.execute.mockResolvedValue({
      id: 'exec-1',
      result: { messages: [{ role: 'assistant', content: 'Claro, te ayudo.' }], conversationId: 'conv-1' },
    });
    mockConversationsService.findOne.mockResolvedValue({ id: 'conv-1', metadata: {} });
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
});
