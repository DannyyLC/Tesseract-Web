import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Delete,
  Res,
} from '@nestjs/common';
import { ExecutionsService } from '../../executions.service';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { UserPayload } from '../../../common/types/jwt-payload.type';
import { DashboardExecutionDto, ExecutionStatsQueryDto } from '../../dto';
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
   * GET /executions/dashboard
   * Obtener datos para el dashboard de ejecuciones (paginado)
   */
  @Get('dashboard')
  async getDashboardData(
    @CurrentUser() user: UserPayload,
    @Query('cursor') cursor: string | null = null,
    @Query('pageSize') pageSize: number = 10,
    @Query('action') action: 'next' | 'prev' | null = null,
    @Query('workflowId') workflowId: string | undefined,
    @Query('userId') userId: string | undefined,
    @Query('startDate') startDate: Date | undefined,
    @Query('endDate') endDate: Date | undefined,
    @Query('status') status: string | undefined,
    @Query('trigger') trigger: string | undefined,
    @Res() res: Response,
  ): Promise<Response<ApiResponse<CursorPaginatedResponse<DashboardExecutionDto>>>> {
    const apiResponse = new ApiResponseBuilder<CursorPaginatedResponse<DashboardExecutionDto>>();
    const data = await this.executionsService.getDashboardData(
      user.organizationId,
      cursor,
      pageSize,
      action,
      {
        workflowId,
        userId,
        startDate,
        endDate,
        status,
        trigger,
      },
    );
    apiResponse
      .setData(data)
      .setMessage('Dashboard executions data retrieved successfully')
      .setSuccess(true);
    return res.status(200).json(apiResponse.build());
  }

  /**
   * GET /executions/stats
   * Obtiene estadísticas generales de ejecuciones de la organización
   */
  @Get('stats')
  async getStats(
    @CurrentUser() user: UserPayload,
    @Query() query: ExecutionStatsQueryDto,
    @Res() res: Response,
  ) {
    const apiResponse = new ApiResponseBuilder<any>();
    const stats = await this.executionsService.getStats(user.organizationId, query.period);
    apiResponse
      .setData(stats)
      .setMessage('Execution stats retrieved successfully')
      .setSuccess(true);
    return res.status(HttpStatus.OK).json(apiResponse.build());
  }

  /**
   * GET /executions/:id
   * Obtiene detalles completos de una ejecución específica
   */
  @Get(':id')
  async getById(@CurrentUser() user: UserPayload, @Param('id') id: string, @Res() res: Response) {
    const apiResponse = new ApiResponseBuilder<any>();
    const execution = await this.executionsService.findOneForClient(id, user.organizationId);
    apiResponse
      .setData(execution)
      .setMessage('Execution details retrieved successfully')
      .setSuccess(true);
    return res.status(HttpStatus.OK).json(apiResponse.build());
  }

  /**
   * POST /executions/:id/cancel
   * Cancela una ejecución en progreso
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@CurrentUser() user: UserPayload, @Param('id') id: string, @Res() res: Response) {
    const apiResponse = new ApiResponseBuilder<any>();
    const execution = await this.executionsService.cancel(id, user.organizationId);
    apiResponse.setData(execution).setMessage('Ejecución cancelada exitosamente').setSuccess(true);
    return res.status(HttpStatus.OK).json(apiResponse.build());
  }

  /**
   * DELETE /executions/:id
   * Eliminar una ejecución (Soft Delete)
   */
  @Delete(':id')
  async remove(@CurrentUser() user: UserPayload, @Param('id') id: string, @Res() res: Response) {
    const apiResponse = new ApiResponseBuilder<void>();
    await this.executionsService.remove(id, user.organizationId);
    apiResponse.setStatusCode(HttpStatus.OK).setMessage('Execution deleted successfully');
    return res.status(HttpStatus.OK).json(apiResponse.build());
  }
}
