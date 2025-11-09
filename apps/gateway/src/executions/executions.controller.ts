import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ExecutionsService } from './executions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserPayload } from '../common/types/jwt-payload.type';

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
   * Lista todas las ejecuciones de la organización
   */
  @Get()
  async findAll(
    @CurrentUser() user: UserPayload,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('workflowId') workflowId?: string,
  ) {
    // Limitar máximo de resultados a 200
    const maxLimit = Math.min(limit || 50, 200);

    return this.executionsService.findAll(
      user.organizationId,
      maxLimit,
      status,
      workflowId,
    );
  }

  /**
   * GET /executions/stats
   * Obtiene estadísticas generales de ejecuciones de la organización
   */
  @Get('stats')
  async getStats(
    @CurrentUser() user: UserPayload,
    @Query('period', new DefaultValuePipe('7d')) period?: string,
  ) {
    return this.executionsService.getStats(user.organizationId, period);
  }

  /**
   * GET /executions/:id
   * Obtiene detalles completos de una ejecución específica
   */
  @Get(':id')
  async findOne(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
  ) {
    return this.executionsService.findOne(id, user.organizationId);
  }

  /**
   * POST /executions/:id/cancel
   * Cancela una ejecución en progreso
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
  ) {
    const execution = await this.executionsService.cancel(id, user.organizationId);
    
    return {
      success: true,
      message: 'Ejecución cancelada exitosamente',
      execution,
    };
  }
}
