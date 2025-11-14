import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Request } from 'express';

/**
 * 📝 Servicio de Auditoría para Super Admins
 * 
 * Registra TODAS las acciones realizadas por super administradores
 * con información detallada para compliance y seguridad.
 * 
 * Cada acción registra:
 * - Quién (super admin email, name, id)
 * - Qué (action, resource, changes)
 * - Cuándo (timestamp)
 * - Dónde (IP, user agent)
 * - Resultado (success, status code, error)
 * 
 * Uso automático: El interceptor AuditInterceptor lo usa automáticamente
 * Uso manual: auditService.log(...)
 */

export interface AuditLogData {
  superAdminId: string;
  superAdminEmail: string;
  superAdminName: string;
  action: string;
  resource: string;
  resourceId?: string;
  method: string;
  endpoint: string;
  changes?: any;
  metadata?: any;
  ipAddress: string;
  userAgent?: string;
  statusCode: number;
  success: boolean;
  errorMessage?: string;
  duration?: number;
  organizationId?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra una acción de super admin
   */
  async log(data: AuditLogData): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          superAdminId: data.superAdminId,
          superAdminEmail: data.superAdminEmail,
          superAdminName: data.superAdminName,
          action: data.action,
          resource: data.resource,
          resourceId: data.resourceId,
          method: data.method,
          endpoint: data.endpoint,
          changes: data.changes || undefined,
          metadata: data.metadata || undefined,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          statusCode: data.statusCode,
          success: data.success,
          errorMessage: data.errorMessage,
          duration: data.duration,
          organizationId: data.organizationId,
        },
      });

      // Log crítico en consola para acciones importantes
      if (this.isCriticalAction(data.action)) {
        this.logger.warn(
          `🔥 CRITICAL AUDIT | ` +
          `Admin: ${data.superAdminEmail} | ` +
          `Action: ${data.action} | ` +
          `Resource: ${data.resource}/${data.resourceId || 'N/A'} | ` +
          `Success: ${data.success}`
        );
      }

    } catch (error) {
      // NUNCA fallar silenciosamente en auditoría
      this.logger.error('❌ FAILED TO CREATE AUDIT LOG', error);
      throw error;
    }
  }

  /**
   * Obtiene el historial de auditoría con filtros
   */
  async findAll(params: {
    superAdminEmail?: string;
    action?: string;
    organizationId?: string;
    success?: boolean;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.superAdminEmail) {
      where.superAdminEmail = params.superAdminEmail;
    }

    if (params.action) {
      where.action = params.action;
    }

    if (params.organizationId) {
      where.organizationId = params.organizationId;
    }

    if (params.success !== undefined) {
      where.success = params.success;
    }

    if (params.startDate || params.endDate) {
      where.timestamp = {};
      if (params.startDate) {
        where.timestamp.gte = params.startDate;
      }
      if (params.endDate) {
        where.timestamp.lte = params.endDate;
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Obtiene estadísticas de auditoría
   */
  async getStats(params: {
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: any = {};

    if (params.startDate || params.endDate) {
      where.timestamp = {};
      if (params.startDate) {
        where.timestamp.gte = params.startDate;
      }
      if (params.endDate) {
        where.timestamp.lte = params.endDate;
      }
    }

    const [
      totalActions,
      successfulActions,
      failedActions,
      uniqueAdmins,
      actionsByType,
      actionsByOrganization,
    ] = await Promise.all([
      // Total de acciones
      this.prisma.auditLog.count({ where }),

      // Acciones exitosas
      this.prisma.auditLog.count({ 
        where: { ...where, success: true } 
      }),

      // Acciones fallidas
      this.prisma.auditLog.count({ 
        where: { ...where, success: false } 
      }),

      // Admins únicos
      this.prisma.auditLog.findMany({
        where,
        select: { superAdminEmail: true },
        distinct: ['superAdminEmail'],
      }),

      // Acciones por tipo
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),

      // Acciones por organización (top 10)
      this.prisma.auditLog.groupBy({
        by: ['organizationId'],
        where: { ...where, organizationId: { not: null } },
        _count: { organizationId: true },
        orderBy: { _count: { organizationId: 'desc' } },
        take: 10,
      }),
    ]);

    return {
      total: totalActions,
      successful: successfulActions,
      failed: failedActions,
      successRate: totalActions > 0 
        ? (successfulActions / totalActions) * 100 
        : 0,
      uniqueAdmins: uniqueAdmins.length,
      topActions: actionsByType.map(item => ({
        action: item.action,
        count: item._count.action,
      })),
      topOrganizations: actionsByOrganization.map(item => ({
        organizationId: item.organizationId,
        count: item._count.organizationId,
      })),
    };
  }

  /**
   * Extrae IP del request
   */
  getClientIP(request: Request): string {
    const xForwardedFor = request.headers['x-forwarded-for'];
    
    if (xForwardedFor) {
      const ips = Array.isArray(xForwardedFor) 
        ? xForwardedFor[0] 
        : xForwardedFor.split(',')[0];
      return ips.trim();
    }

    const xRealIP = request.headers['x-real-ip'];
    if (xRealIP) {
      return Array.isArray(xRealIP) ? xRealIP[0] : xRealIP;
    }

    return request.socket.remoteAddress || 'unknown';
  }

  /**
   * Determina si una acción es crítica
   */
  private isCriticalAction(action: string): boolean {
    const criticalActions = [
      'change_plan',
      'delete_organization',
      'delete_user',
      'impersonate_user',
      'change_organization_limits',
      'force_delete',
    ];

    return criticalActions.includes(action);
  }
}
