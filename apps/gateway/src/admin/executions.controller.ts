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
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ExecutionsService } from '../executions/executions.service';
import { SuperAdminGuard } from './guards/super-admin.guard';
import { CurrentSuperAdmin } from './decorators/current-super-admin.decorator';
import {
  AdminExecutionQueryDto,
  AdminExecutionStatsQueryDto,
  AdminResourceQueryDto,
  AdminAnalyticsSourceQueryDto,
} from './dto/admin-execution-query.dto';

/**
 * ADMIN EXECUTIONS CONTROLLER - SOLO SUPER ADMINS
 * 
 * Este controlador permite a los super admins:
 * - Ver ejecuciones de CUALQUIER organización
 * - Acceder a información técnica completa (cost, tokensUsed, creditTransaction)
 * - Aplicar filtros avanzados con paginación cursor
 * - Ver estadísticas globales del sistema
 * 
 * Base path: /admin/executions
 * Todas las acciones son registradas en audit logs
 */
@Controller('admin/executions')
@UseGuards(SuperAdminGuard)
export class AdminExecutionsController {
  constructor(
    private readonly executionsService: ExecutionsService
  ) {}

  /**
   * GET /admin/executions
   * Lista todas las ejecuciones del sistema o de una organización específica
   * Con paginación cursor y filtros avanzados
   */
  @Get()
  async findAll(
    @CurrentSuperAdmin() superAdmin: { id: string; email: string; name: string },
    @Query(new ValidationPipe({ transform: true })) query: AdminExecutionQueryDto,
  ) {
    return this.executionsService.findAllForAdmin(query.organizationId, {
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
   * GET /admin/executions/stats
   * Obtiene estadísticas de ejecuciones
   * Si no se proporciona organizationId, devuelve stats globales del sistema
   */
  @Get('stats')
  async getStats(
    @CurrentSuperAdmin() superAdmin: { id: string; email: string; name: string },
    @Query(new ValidationPipe({ transform: true })) query: AdminExecutionStatsQueryDto,
  ) {
    // Si no hay organizationId, obtener stats de todas las organizaciones
    if (!query.organizationId) {
      // TODO: Implementar stats globales en el futuro
      // Por ahora, requerir organizationId
      return {
        error: 'organizationId es requerido. Stats globales en desarrollo.',
      };
    }

    return this.executionsService.getStats(query.organizationId, query.period);
  }

  /**
   * GET /admin/executions/:id
   * Obtiene detalles COMPLETOS de una ejecución específica
   * Incluye: cost, tokensUsed, errorStack, creditTransaction
   */
  @Get(':id')
  async findOne(
    @CurrentSuperAdmin() superAdmin: { id: string; email: string; name: string },
    @Param('id') id: string,
    @Query(new ValidationPipe({ transform: true })) query: AdminResourceQueryDto,
  ) {
    return this.executionsService.findOneForAdmin(id, query.organizationId);
  }

  /**
   * POST /admin/executions/:id/cancel
   * Cancela una ejecución en progreso
   * Requiere organizationId para validar ownership
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentSuperAdmin() superAdmin: { id: string; email: string; name: string },
    @Param('id') id: string,
    @Query(new ValidationPipe({ transform: true })) query: AdminResourceQueryDto,
  ) {
    if (!query.organizationId) {
      return {
        error: 'organizationId es requerido para cancelar una ejecución',
      };
    }

    const execution = await this.executionsService.cancel(id, query.organizationId);

    return {
      success: true,
      message: `Ejecución cancelada por super admin ${superAdmin.email}`,
      execution,
    };
  }

  /**
   * GET /admin/executions/workflow/:workflowId
   * Lista ejecuciones de un workflow específico
   * Útil para debugging y análisis de workflows problemáticos
   */
  @Get('workflow/:workflowId')
  async findByWorkflow(
    @CurrentSuperAdmin() superAdmin: { id: string; email: string; name: string },
    @Param('workflowId') workflowId: string,
    @Query('organizationId') organizationId?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('status') status?: string,
  ) {
    if (!organizationId) {
      return {
        error: 'organizationId es requerido para listar por workflow',
      };
    }

    return this.executionsService.findByWorkflow(
      workflowId,
      organizationId,
      limit,
      status,
    );
  }

  /**
   * GET /admin/executions/analytics/source
   * Obtiene analytics por fuente (API key o usuario) de un workflow
   */
  @Get('analytics/source')
  async getAnalyticsBySource(
    @CurrentSuperAdmin() superAdmin: { id: string; email: string; name: string },
    @Query(new ValidationPipe({ transform: true })) query: AdminAnalyticsSourceQueryDto,
  ) {
    if (!query.workflowId || !query.organizationId) {
      return {
        error: 'workflowId y organizationId son requeridos',
      };
    }

    return this.executionsService.getAnalyticsBySource(
      query.workflowId,
      query.organizationId,
      query.period,
    );
  }
}
