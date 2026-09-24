import { InterventionRequest } from '../../core/intervention-access.guard';
import { InterventionTokenClaims } from '../../core/intervention-token.service';
import { ConversationsService } from '../../conversations.service';
import { InterventionController } from './intervention.controller';

/**
 * Mismo criterio que `dataset-query.controller.spec.ts`: la organización y la conversación salen
 * del token, nunca del body — este endpoint no recibe `conversationId` por parámetro, así que lo
 * único que hay que sostener es que lo que llega a `requestHumanIntervention` es lo que dice el
 * token, no lo que mandó el llamador.
 */
describe('InterventionController', () => {
  const claims: InterventionTokenClaims = {
    organizationId: 'org-1',
    conversationId: 'conv-1',
    workflowId: 'wf-1',
  };

  const mockConversationsService: any = { requestHumanIntervention: jest.fn() };

  let controller: InterventionController;

  const requestWith = (interventionClaims: InterventionTokenClaims) =>
    ({ interventionClaims }) as unknown as InterventionRequest;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConversationsService.requestHumanIntervention.mockResolvedValue(undefined);

    controller = new InterventionController(mockConversationsService as ConversationsService);
  });

  it('usa la organización y la conversación del token, y pasa el reason tal cual', async () => {
    await controller.requestIntervention(requestWith(claims), { reason: 'Número foráneo' });

    expect(mockConversationsService.requestHumanIntervention).toHaveBeenCalledWith(
      'org-1',
      'conv-1',
      'Número foráneo',
    );
  });

  it('funciona sin reason (queda el default del service)', async () => {
    await controller.requestIntervention(requestWith(claims), {});

    expect(mockConversationsService.requestHumanIntervention).toHaveBeenCalledWith(
      'org-1',
      'conv-1',
      undefined,
    );
  });
});
