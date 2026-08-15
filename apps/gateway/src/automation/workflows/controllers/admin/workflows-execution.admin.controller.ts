import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApiResponse, ApiResponseBuilder, UserRole } from '@tesseract/types';
import { TriggerType } from '@tesseract/database';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { Roles } from '@/identity/auth/decorators/roles.decorator';
import { CurrentUser } from '@/identity/auth/decorators/current-user.decorator';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import { CloudTasksService } from '@/platform/tasks/cloud-tasks.service';
import { ExecutionsService } from '@/automation/executions/executions.service';
import { WorkflowsService } from '../../workflows.service';
import { TestExecuteWorkflowDto } from '../../dto/admin';
import { WORKFLOWS_TEST_WORKER_PATH } from '../../workflows-test-worker.constants';

/**
 * Ejecutar workflows internos (`isInternal: true`) para probarlos como super admin, lo más
 * cerca posible de un escenario real: síncrono, streaming y asíncrono (encolado + polling).
 *
 * Nunca opera sobre workflows publicados: `WorkflowsService.execute()`/`executeStream()`
 * saltan el descuento de crédito y las estadísticas del cliente solo cuando
 * `workflow.isInternal` es `true`, así que probar aquí un workflow ya publicado le regalaría
 * ejecuciones gratis e invisibles a un cliente real. Por eso cada endpoint valida
 * `isInternal` antes de ejecutar.
 */
@ApiTags('Admin - Workflows - Test Execute')
@ApiBearerAuth('access-token')
@Controller('admin/workflows')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class WorkflowsExecutionAdminController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly executionsService: ExecutionsService,
    private readonly cloudTasks: CloudTasksService,
  ) {}

  @Post(':id/test-execute')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Probar un workflow interno (síncrono)' })
  async testExecute(
    @Param('id') id: string,
    @Body() dto: TestExecuteWorkflowDto,
    @CurrentUser() user: UserPayload,
  ): Promise<ApiResponse> {
    await this.workflowsService.assertInternalForTesting(dto.organizationId, id);

    const execution = await this.workflowsService.execute(
      dto.organizationId,
      id,
      dto.input,
      { ...dto.metadata, channel: 'admin-test' },
      user?.sub,
      undefined, // whatsappData
      undefined, // apiKeyId
      dto.trigger ?? TriggerType.MANUAL,
      undefined, // executionId
      true, // allowInternal: ya se validó arriba que el workflow SÍ es interno
    );

    return new ApiResponseBuilder().setData(execution).build();
  }

  @Post(':id/test-execute/stream')
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  @Header('X-Accel-Buffering', 'no')
  @ApiOperation({ summary: 'Probar un workflow interno (streaming)' })
  async testExecuteStream(
    @Param('id') id: string,
    @Body() dto: TestExecuteWorkflowDto,
    @CurrentUser() user: UserPayload,
  ): Promise<StreamableFile> {
    await this.workflowsService.assertInternalForTesting(dto.organizationId, id);

    const stream = await this.workflowsService.executeStream(
      dto.organizationId,
      id,
      dto.input,
      { ...dto.metadata, channel: 'admin-test' },
      user?.sub,
      undefined, // apiKeyId
      dto.trigger ?? TriggerType.MANUAL,
      undefined, // executionId
      true, // allowInternal: ya se validó arriba que el workflow SÍ es interno
    );

    return new StreamableFile(stream as any);
  }

  @Post(':id/test-execute/async')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Encolar la prueba de un workflow interno; el resultado se consulta con polling',
  })
  async testExecuteAsync(
    @Param('id') id: string,
    @Body() dto: TestExecuteWorkflowDto,
    @CurrentUser() user: UserPayload,
  ): Promise<ApiResponse> {
    await this.workflowsService.assertInternalForTesting(dto.organizationId, id);

    // Se genera aquí (y no dentro de execute()) para poder devolverlo de inmediato: el
    // caller necesita el id para hacer polling antes de que el worker siquiera arranque.
    const executionId = randomUUID();

    await this.cloudTasks.enqueue({
      path: WORKFLOWS_TEST_WORKER_PATH,
      taskId: `test-${executionId}`,
      payload: {
        organizationId: dto.organizationId,
        workflowId: id,
        input: dto.input,
        metadata: dto.metadata,
        userId: user?.sub,
        trigger: dto.trigger ?? TriggerType.MANUAL,
        executionId,
      },
    });

    return new ApiResponseBuilder()
      .setData({ executionId })
      .setMessage('Ejecución de prueba encolada')
      .build();
  }

  @Get('test-executions/:executionId')
  @ApiOperation({ summary: 'Consultar el resultado de una ejecución de prueba' })
  async getTestExecution(
    @Param('executionId') executionId: string,
    @Query('organizationId') organizationId: string,
  ): Promise<ApiResponse> {
    // Sin este chequeo, omitir el query param deja `organizationId` en `undefined`, y
    // Prisma ignora una propiedad `undefined` en el `where` de getByIdFull() — devolvería
    // la ejecución de cualquier organización que tenga ese id, no solo la que se pidió.
    if (!organizationId) {
      throw new BadRequestException('organizationId es requerido');
    }

    const execution = await this.executionsService.getByIdFull(executionId, organizationId);
    return new ApiResponseBuilder().setData(execution).build();
  }
}
