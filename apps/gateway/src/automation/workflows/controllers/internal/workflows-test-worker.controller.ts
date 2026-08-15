import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Prisma, TriggerType } from '@tesseract/database';
import { CloudTasksOidcGuard } from '@/platform/tasks/cloud-tasks-oidc.guard';
import {
  InvalidWorkflowConfigException,
  WorkflowNotFoundException,
  WorkflowPausedException,
} from '@/platform/common/exceptions';
import { WorkflowsService } from '../../workflows.service';

interface TestExecutePayload {
  organizationId: string;
  workflowId: string;
  input: Record<string, any>;
  metadata?: Record<string, any>;
  userId?: string;
  trigger?: TriggerType;
  executionId: string;
}

/**
 * Cloud Tasks invoca esto para correr, fuera del ciclo HTTP del endpoint de encolado, el
 * test-execute asíncrono de un workflow interno. Mismo molde que
 * `WhatsappWorkerController`: el `executionId` viaja ya generado desde el endpoint que
 * encoló, así que el caller pudo hacer polling desde antes de que esto corra.
 *
 * No repite el chequeo de `isInternal`: el endpoint de encolado (`testExecuteAsync`) ya
 * corrió `assertInternalForTesting()` antes de encolar, así que aquí se pasa
 * `allowInternal: true` directo. `WorkflowsService.execute()` sigue re-derivando
 * `workflow.isInternal` de la base de datos para decidir si saltar créditos/stats (no confía
 * en lo que se encoló), pero con `allowInternal: true` ya no bloquea la ejecución en sí,
 * pase lo que pase con esa bandera entre que se encoló y que esto corre.
 *
 * Contrato de respuesta, igual que `WhatsappWorkerController` (es lo que decide si Cloud
 * Tasks reintenta):
 *
 * - **2xx** → terminado, o fallo permanente que reintentar no arregla. No reintentar.
 * - **5xx** → fallo transitorio. Reintentar.
 */
@SkipThrottle()
@UseGuards(CloudTasksOidcGuard)
@Controller('admin/workflows/internal')
export class WorkflowsTestWorkerController {
  private readonly logger = new Logger(WorkflowsTestWorkerController.name);

  constructor(private readonly workflowsService: WorkflowsService) {}

  @Post('test-execute')
  @HttpCode(HttpStatus.OK)
  async run(@Body() body: TestExecutePayload): Promise<{ processed: boolean; reason?: string }> {
    try {
      await this.workflowsService.execute(
        body.organizationId,
        body.workflowId,
        body.input,
        { ...body.metadata, channel: 'admin-test' },
        body.userId,
        undefined, // whatsappData
        undefined, // apiKeyId
        body.trigger ?? TriggerType.MANUAL,
        body.executionId,
        true, // allowInternal: el endpoint de encolado ya validó isInternal antes de encolar
      );

      return { processed: true };
    } catch (error) {
      // Reintento de Cloud Tasks con el mismo `executionId` ya generado: la primera
      // pasada ya creó la fila de Execution antes de fallar (o incluso terminó
      // bien y solo se perdió el ACK). No hay nada que rehacer — tratarlo como
      // éxito evita un reintento que jamás va a superar el unique constraint.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.log(`Reintento de test-execute para ${body.executionId}, ya estaba creada`);
        return { processed: true };
      }

      // Fallos de negocio: reintentar no los arregla (el workflow sigue pausado, el
      // config sigue mal, ya no existe/no es internal, o no hay crédito). Responder
      // 2xx para que Cloud Tasks no insista en algo que nunca va a cambiar solo —
      // un 403 de ForbiddenException se reintentaría igual que un 500 si se deja
      // subir tal cual.
      if (
        error instanceof WorkflowPausedException ||
        error instanceof InvalidWorkflowConfigException ||
        error instanceof WorkflowNotFoundException ||
        error instanceof ForbiddenException
      ) {
        this.logger.warn(`test-execute ${body.executionId} no se pudo correr: ${error.message}`);
        return { processed: false, reason: error.constructor.name };
      }

      // Cualquier otro error (DB caída, agents service abajo) es candidato a
      // transitorio: se deja subir para que el filtro global responda 5xx y
      // Cloud Tasks reintente.
      this.logger.error(`Error corriendo test-execute ${body.executionId}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
}
