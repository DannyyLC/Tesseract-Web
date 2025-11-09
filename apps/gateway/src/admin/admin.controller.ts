import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Req,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { SuperAdminGuard } from './guards/super-admin.guard';
import { CurrentSuperAdmin } from './decorators/current-super-admin.decorator';
import { Public } from './decorators/public.decorator';
import { AdminService } from './services/admin.service';
import { AuditService } from './services/audit.service';
import { SuperAdminsConfig } from './config/super-admins.config';
import { SuperAdminLoginDto } from './dto/super-admin-login.dto';

/**
 * 🔥 ADMIN CONTROLLER - SOLO SUPER ADMINS
 * 
 * ⚠️  Este controlador tiene acceso a TODAS las organizaciones del sistema
 * ⚠️  Todas las acciones son registradas en audit logs
 * 
 * Funcionalidades:
 * - Login especial para super admins
 * - Ver/gestionar TODAS las organizaciones
 * - Ver/gestionar usuarios de cualquier organización
 * - Cambiar planes y límites
 * - Ver analytics globales del sistema
 * - Ver audit logs
 */
@Controller('admin')
@UseGuards(SuperAdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly auditService: AuditService,
    private readonly superAdminsConfig: SuperAdminsConfig,
    private readonly jwtService: JwtService,
  ) {}

  // ============================================
  // AUTHENTICATION
  // ============================================

  /**
   * Login especial para super admins
   * 
   * ⚠️  NO protegido por guard (es el endpoint de login)
   * ✅  Validación contra configuración (no DB)
   * ✅  Rate limiting aplicado por IP
   * ✅  Logging exhaustivo
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: SuperAdminLoginDto,
    @Req() request: Request,
  ) {
    const clientIP = this.auditService.getClientIP(request);

    // Verificar credenciales
    const superAdmin = await this.superAdminsConfig.verifyCredentials(
      dto.email,
      dto.password,
    );

    if (!superAdmin) {
      // Log intento fallido
      await this.auditService.log({
        superAdminId: 'unknown',
        superAdminEmail: dto.email,
        superAdminName: 'unknown',
        action: 'login_failed',
        resource: 'SuperAdmin',
        method: 'POST',
        endpoint: '/admin/login',
        ipAddress: clientIP,
        userAgent: request.headers['user-agent'],
        statusCode: 401,
        success: false,
        errorMessage: 'Invalid credentials',
      });

      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Verificar IP whitelist
    if (!this.superAdminsConfig.isIPAllowed(dto.email, clientIP)) {
      // Log intento desde IP no permitida
      await this.auditService.log({
        superAdminId: superAdmin.id,
        superAdminEmail: superAdmin.email,
        superAdminName: superAdmin.name,
        action: 'login_blocked_ip',
        resource: 'SuperAdmin',
        method: 'POST',
        endpoint: '/admin/login',
        metadata: { blockedIP: clientIP },
        ipAddress: clientIP,
        userAgent: request.headers['user-agent'],
        statusCode: 403,
        success: false,
        errorMessage: 'IP not allowed',
      });

      throw new UnauthorizedException(`Acceso denegado desde esta IP: ${clientIP}`);
    }

    // Generar JWT especial
    const payload = {
      sub: superAdmin.id,
      email: superAdmin.email,
      name: superAdmin.name,
      role: 'super_admin' as const,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    // Log login exitoso
    await this.auditService.log({
      superAdminId: superAdmin.id,
      superAdminEmail: superAdmin.email,
      superAdminName: superAdmin.name,
      action: 'login_success',
      resource: 'SuperAdmin',
      method: 'POST',
      endpoint: '/admin/login',
      ipAddress: clientIP,
      userAgent: request.headers['user-agent'],
      statusCode: 200,
      success: true,
    });

    return {
      accessToken,
      superAdmin: {
        id: superAdmin.id,
        email: superAdmin.email,
        name: superAdmin.name,
        role: 'super_admin',
      },
      expiresIn: '30m',
    };
  }

  // ============================================
  // ORGANIZATIONS
  // ============================================

  /**
   * Lista TODAS las organizaciones del sistema
   * 
   * @query page - Página (default: 1)
   * @query limit - Resultados por página (default: 50)
   * @query search - Buscar por nombre o slug
   * @query plan - Filtrar por plan
   * @query isActive - Filtrar por estado
   */
  @Get('organizations')
  async getAllOrganizations(
    @CurrentSuperAdmin() superAdmin: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('plan') plan?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.adminService.getAllOrganizations({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      plan,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
  }

  /**
   * Ver detalles de una organización específica
   */
  @Get('organizations/:id')
  async getOrganization(
    @CurrentSuperAdmin() superAdmin: any,
    @Param('id') id: string,
  ) {
    return this.adminService.getOrganization(id);
  }

  /**
   * Cambiar el plan de una organización
   */
  @Patch('organizations/:id/plan')
  async changeOrganizationPlan(
    @CurrentSuperAdmin() superAdmin: any,
    @Param('id') id: string,
    @Body() body: { plan: 'free' | 'pro' | 'enterprise' },
  ) {
    return this.adminService.changeOrganizationPlan(id, body.plan);
  }

  /**
   * Actualizar límites de una organización manualmente
   */
  @Patch('organizations/:id/limits')
  async updateOrganizationLimits(
    @CurrentSuperAdmin() superAdmin: any,
    @Param('id') id: string,
    @Body() body: {
      maxUsers?: number;
      maxWorkflows?: number;
      maxExecutionsPerDay?: number;
      maxApiKeys?: number;
    },
  ) {
    return this.adminService.updateOrganizationLimits(id, body);
  }

  /**
   * Pausar/activar una organización
   */
  @Patch('organizations/:id/status')
  async toggleOrganizationStatus(
    @CurrentSuperAdmin() superAdmin: any,
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ) {
    return this.adminService.toggleOrganizationStatus(id, body.isActive);
  }

  /**
   * Eliminar una organización (soft delete)
   */
  @Delete('organizations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteOrganization(
    @CurrentSuperAdmin() superAdmin: any,
    @Param('id') id: string,
  ) {
    return this.adminService.deleteOrganization(id);
  }

  // ============================================
  // USERS
  // ============================================

  /**
   * Lista TODOS los usuarios de una organización
   */
  @Get('organizations/:organizationId/users')
  async getOrganizationUsers(
    @CurrentSuperAdmin() superAdmin: any,
    @Param('organizationId') organizationId: string,
  ) {
    return this.adminService.getOrganizationUsers(organizationId);
  }

  /**
   * Ver detalles de un usuario específico
   */
  @Get('users/:id')
  async getUser(
    @CurrentSuperAdmin() superAdmin: any,
    @Param('id') id: string,
  ) {
    return this.adminService.getUser(id);
  }

  /**
   * Cambiar el rol de un usuario
   */
  @Patch('users/:id/role')
  async changeUserRole(
    @CurrentSuperAdmin() superAdmin: any,
    @Param('id') id: string,
    @Body() body: { role: 'owner' | 'admin' | 'viewer' },
  ) {
    return this.adminService.changeUserRole(id, body.role);
  }

  /**
   * Pausar/activar un usuario
   */
  @Patch('users/:id/status')
  async toggleUserStatus(
    @CurrentSuperAdmin() superAdmin: any,
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ) {
    return this.adminService.toggleUserStatus(id, body.isActive);
  }

  // ============================================
  // ANALYTICS GLOBALES
  // ============================================

  /**
   * Estadísticas globales del sistema
   */
  @Get('stats')
  async getGlobalStats(
    @CurrentSuperAdmin() superAdmin: any,
  ) {
    return this.adminService.getGlobalStats();
  }

  /**
   * Estadísticas por plan
   */
  @Get('stats/by-plan')
  async getStatsByPlan(
    @CurrentSuperAdmin() superAdmin: any,
  ) {
    return this.adminService.getStatsByPlan();
  }

  /**
   * Top organizaciones por uso
   */
  @Get('stats/top-organizations')
  async getTopOrganizations(
    @CurrentSuperAdmin() superAdmin: any,
    @Query('metric') metric: 'executions' | 'workflows' | 'users' = 'executions',
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getTopOrganizations(
      metric,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  // ============================================
  // AUDIT LOGS
  // ============================================

  /**
   * Ver historial de auditoría
   */
  @Get('audit-logs')
  async getAuditLogs(
    @CurrentSuperAdmin() superAdmin: any,
    @Query('superAdminEmail') superAdminEmail?: string,
    @Query('action') action?: string,
    @Query('organizationId') organizationId?: string,
    @Query('success') success?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.findAll({
      superAdminEmail,
      action,
      organizationId,
      success: success !== undefined ? success === 'true' : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /**
   * Estadísticas de auditoría
   */
  @Get('audit-logs/stats')
  async getAuditStats(
    @CurrentSuperAdmin() superAdmin: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.auditService.getStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }
}
