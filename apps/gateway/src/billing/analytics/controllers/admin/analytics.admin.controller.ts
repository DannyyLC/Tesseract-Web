import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponse, ApiResponseBuilder, UserRole } from '@tesseract/types';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { Roles } from '@/identity/auth/decorators/roles.decorator';
import { AdminAnalyticsService } from '../../analytics.service';

/**
 * Analítica de costos de plataforma para el super admin: compara el costo real de ejecutar
 * workflows contra lo que se cobra en créditos, para validar si los precios por categoría
 * (LIGHT/STANDARD/ADVANCED) cubren el gasto real de LLM.
 */
@ApiTags('Admin - Analytics')
@ApiBearerAuth('access-token')
@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class AnalyticsAdminController {
  constructor(private readonly analyticsService: AdminAnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'KPIs globales de plataforma + desglose por categoría de workflow' })
  async overview(
    @Query('period', new DefaultValuePipe('30d')) period: string,
  ): Promise<ApiResponse> {
    const result = await this.analyticsService.getOverview(period);
    return new ApiResponseBuilder().setData(result).build();
  }

  @Get('timeseries')
  @ApiOperation({ summary: 'Serie diaria de ejecuciones y costo real (UTC)' })
  async timeseries(
    @Query('period', new DefaultValuePipe('30d')) period: string,
  ): Promise<ApiResponse> {
    const result = await this.analyticsService.getTimeseries(period);
    return new ApiResponseBuilder().setData(result).build();
  }

  @Get('top-workflows')
  @ApiOperation({ summary: 'Ranking de workflows por costo real o por volumen de ejecuciones' })
  async topWorkflows(
    @Query('period', new DefaultValuePipe('30d')) period: string,
    @Query('metric', new DefaultValuePipe('cost')) metric: 'cost' | 'executions',
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<ApiResponse> {
    const result = await this.analyticsService.getTopWorkflows(period, metric, limit);
    return new ApiResponseBuilder().setData(result).build();
  }

  @Get('organizations-margin')
  @ApiOperation({ summary: 'Ranking de organizaciones por margen (costo real vs. lo cobrado)' })
  async organizationsMargin(
    @Query('period', new DefaultValuePipe('30d')) period: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('sortBy', new DefaultValuePipe('marginPct')) sortBy: 'marginPct' | 'costUSD' | 'executions',
  ): Promise<ApiResponse> {
    const result = await this.analyticsService.getOrganizationsMargin(period, page, limit, sortBy);
    return new ApiResponseBuilder().setData(result).build();
  }
}
