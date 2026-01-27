import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  Res,
} from '@nestjs/common';
import { ExecutionsService } from './executions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserPayload } from '../common/types/jwt-payload.type';
import { DashboardExecutionDto, ExecutionQueryDto, ExecutionStatsQueryDto } from './dto';
import {
  ApiResponse,
  ApiResponseBuilder,
  CursorPaginatedResponse,
} from '@workflow-automation/shared-types';
import { Response } from 'express';
/**
 * Controller de Executions
 * Maneja el historial y estado de las ejecuciones de workflows
 *
 * Base path: /executions
 * Todos los endpoints requieren autenticación JWT (solo para usuarios desde UI)
 *
 * Responsabilidades:
 * - Consultar historial de ejecuciones
 * - Ver detalles de una ejecución específica
 * - Cancelar ejecuciones en progreso
 * - Obtener estadísticas de ejecuciones
 */
@Controller('executions')
@UseGuards(JwtAuthGuard)
export class ExecutionsController {
  constructor(private readonly executionsService: ExecutionsService) {}

  /**
   * GET /executions
   * Lista todas las ejecuciones de la organización con paginación cursor
   */
  @Get()
  async findAll(
    @CurrentUser() user: UserPayload,
    @Query(new ValidationPipe({ transform: true })) query: ExecutionQueryDto,
  ) {
    return this.executionsService.findAll(user.organizationId, {
      limit: query.limit,
      cursor: query.cursor,
      status: query.status,
      workflowId: query.workflowId,
      trigger: query.trigger,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      wasOverage: query.wasOverage,
      userId: query.userId,
      apiKeyId: query.apiKeyId,
    });
  }

  /**
   * GET /executions/stats
   * Obtiene estadísticas generales de ejecuciones de la organización
   */
  @Get('stats')
  async getStats(
    @CurrentUser() user: UserPayload,
    @Query(new ValidationPipe({ transform: true }))
    query: ExecutionStatsQueryDto,
  ) {
    return this.executionsService.getStats(user.organizationId, query.period);
  }

  /**
   * GET /executions/:id
   * Obtiene detalles completos de una ejecución específica
   */
  @Get(':id')
  async findOne(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return this.executionsService.findOneForClient(id, user.organizationId);
  }

  /**
   * POST /executions/:id/cancel
   * Cancela una ejecución en progreso
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    const execution = await this.executionsService.cancel(id, user.organizationId);

    return {
      success: true,
      message: 'Ejecución cancelada exitosamente',
      execution,
    };
  }

  @Get('dashboard')
  async getDashboardData(
    @CurrentUser() user: UserPayload,
    @Query('cursor') cursor: string | null = null,
    @Query('pageSize') pageSize: number = 10,
    @Query('action') action: 'next' | 'prev' | null = null,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<CursorPaginatedResponse<DashboardExecutionDto>>>> {
    const apiResponse = new ApiResponseBuilder<CursorPaginatedResponse<DashboardExecutionDto>>();
    const data = await this.executionsService.getDashboardData(
      user.organizationId,
      cursor,
      pageSize,
      action,
    );
    apiResponse
      .setData(data)
      .setMessage('Dashboard executions data retrieved successfully')
      .setSuccess(true);
    return res.status(200).json(apiResponse.build());
  }
}
