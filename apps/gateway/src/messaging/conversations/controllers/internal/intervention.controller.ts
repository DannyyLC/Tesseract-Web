import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InterventionAccessGuard, InterventionRequest } from '../../core/intervention-access.guard';
import { ConversationsService } from '../../conversations.service';
import { RequestInterventionDto } from '../../dto/request-intervention.dto';

/**
 * Lo que llama la tool determinista `activate_human_intervention` (apps/agents/src/tools/human_intervention.py)
 * desde un nodo `tool` del workflow — sin pasar por el LLM.
 *
 * No hay `conversationId` en la ruta a propósito: sale del token, igual que en
 * `dataset-query.controller.ts`. Reutiliza `ConversationsService.requestHumanIntervention`, el
 * mismo método que ya usa el flujo LLM-driven (`request_human_handoff`) y el botón "Tomar control"
 * del dashboard — no se reimplementa nada de esa lógica.
 *
 * Mismo criterio que dataset: el ThrottlerGuard global no aplica, todas las llamadas salen del
 * servicio de agentes. Lo que protege este endpoint es el token con alcance.
 */
@SkipThrottle()
@Controller('internal/conversations')
@UseGuards(InterventionAccessGuard)
export class InterventionController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post('intervention')
  async requestIntervention(
    @Req() request: InterventionRequest,
    @Body() body: RequestInterventionDto,
  ): Promise<void> {
    const { organizationId, conversationId } = request.interventionClaims!;

    await this.conversationsService.requestHumanIntervention(
      organizationId,
      conversationId,
      body.reason,
    );
  }
}
