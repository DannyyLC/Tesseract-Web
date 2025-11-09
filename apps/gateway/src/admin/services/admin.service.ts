import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PLANS } from '@workflow-automation/shared-types';

/**
 * 🔥 ADMIN SERVICE
 * 
 * Servicio para gestionar TODAS las organizaciones y usuarios del sistema
 * Solo accesible para super admins
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // ORGANIZATIONS
  // ============================================

  /**
   * Lista TODAS las organizaciones
   */
  async getAllOrganizations(params: {
    page?: number;
    limit?: number;
    search?: string;
    plan?: string;
    isActive?: boolean;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {
      deletedAt: null,
    };

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { slug: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (params.plan) {
      where.plan = params.plan;
    }

    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
    }

    const [organizations, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              users: true,
              workflows: true,
              executions: true,
              apiKeys: true,
            },
          },
        },
      }),
      this.prisma.organization.count({ where }),
    ]);

    return {
      data: organizations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Obtiene una organización específica
   */
  async getOrganization(id: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            createdAt: true,
            lastLoginAt: true,
          },
        },
        _count: {
          select: {
            workflows: true,
            executions: true,
            apiKeys: true,
          },
        },
      },
    });

    if (!organization) {
      throw new NotFoundException(`Organización ${id} no encontrada`);
    }

    return organization;
  }

  /**
   * Cambia el plan de una organización
   */
  async changeOrganizationPlan(id: string, plan: 'free' | 'pro' | 'enterprise') {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
    });

    if (!organization) {
      throw new NotFoundException(`Organización ${id} no encontrada`);
    }

    const planConfig = PLANS[plan];

    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        plan,
        maxUsers: planConfig.limits.maxUsers,
        maxWorkflows: planConfig.limits.maxWorkflows,
        maxExecutionsPerDay: planConfig.limits.maxExecutionsPerDay,
        maxApiKeys: planConfig.limits.maxApiKeys,
      },
    });

    return {
      message: `Plan cambiado de ${organization.plan} a ${plan}`,
      organization: updated,
    };
  }

  /**
   * Actualiza los límites de una organización manualmente
   */
  async updateOrganizationLimits(
    id: string,
    limits: {
      maxUsers?: number;
      maxWorkflows?: number;
      maxExecutionsPerDay?: number;
      maxApiKeys?: number;
    },
  ) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
    });

    if (!organization) {
      throw new NotFoundException(`Organización ${id} no encontrada`);
    }

    const updated = await this.prisma.organization.update({
      where: { id },
      data: limits,
    });

    return {
      message: 'Límites actualizados',
      organization: updated,
    };
  }

  /**
   * Activa/pausa una organización
   */
  async toggleOrganizationStatus(id: string, isActive: boolean) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
    });

    if (!organization) {
      throw new NotFoundException(`Organización ${id} no encontrada`);
    }

    const updated = await this.prisma.organization.update({
      where: { id },
      data: { isActive },
    });

    return {
      message: isActive ? 'Organización activada' : 'Organización pausada',
      organization: updated,
    };
  }

  /**
   * Elimina una organización (soft delete)
   */
  async deleteOrganization(id: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
    });

    if (!organization) {
      throw new NotFoundException(`Organización ${id} no encontrada`);
    }

    await this.prisma.organization.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return {
      message: 'Organización eliminada',
    };
  }

  // ============================================
  // USERS
  // ============================================

  /**
   * Lista todos los usuarios de una organización
   */
  async getOrganizationUsers(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException(`Organización ${organizationId} no encontrada`);
    }

    const users = await this.prisma.user.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        emailVerified: true,
        twoFactorEnabled: true,
        createdAt: true,
        lastLoginAt: true,
        _count: {
          select: {
            executionsManual: true,
          },
        },
      },
    });

    return users;
  }

  /**
   * Obtiene un usuario específico
   */
  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
          },
        },
        _count: {
          select: {
            executionsManual: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`Usuario ${id} no encontrado`);
    }

    // No devolver password
    const { password, ...userWithoutPassword } = user;

    return userWithoutPassword;
  }

  /**
   * Cambia el rol de un usuario
   */
  async changeUserRole(id: string, role: 'owner' | 'admin' | 'viewer') {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`Usuario ${id} no encontrado`);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role },
    });

    const { password, ...userWithoutPassword } = updated;

    return {
      message: `Rol cambiado de ${user.role} a ${role}`,
      user: userWithoutPassword,
    };
  }

  /**
   * Activa/pausa un usuario
   */
  async toggleUserStatus(id: string, isActive: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`Usuario ${id} no encontrado`);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive },
    });

    const { password, ...userWithoutPassword } = updated;

    return {
      message: isActive ? 'Usuario activado' : 'Usuario pausado',
      user: userWithoutPassword,
    };
  }

  // ============================================
  // ANALYTICS GLOBALES
  // ============================================

  /**
   * Estadísticas globales del sistema
   */
  async getGlobalStats() {
    const [
      totalOrganizations,
      activeOrganizations,
      totalUsers,
      activeUsers,
      totalWorkflows,
      activeWorkflows,
      totalExecutions,
      successfulExecutions,
      totalApiKeys,
    ] = await Promise.all([
      this.prisma.organization.count({ where: { deletedAt: null } }),
      this.prisma.organization.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.workflow.count({ where: { deletedAt: null } }),
      this.prisma.workflow.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.execution.count(),
      this.prisma.execution.count({ where: { status: 'completed' } }),
      this.prisma.apiKey.count({ where: { deletedAt: null, isActive: true } }),
    ]);

    return {
      organizations: {
        total: totalOrganizations,
        active: activeOrganizations,
      },
      users: {
        total: totalUsers,
        active: activeUsers,
      },
      workflows: {
        total: totalWorkflows,
        active: activeWorkflows,
      },
      executions: {
        total: totalExecutions,
        successful: successfulExecutions,
        failed: totalExecutions - successfulExecutions,
        successRate: totalExecutions > 0 
          ? (successfulExecutions / totalExecutions) * 100 
          : 0,
      },
      apiKeys: {
        total: totalApiKeys,
      },
    };
  }

  /**
   * Estadísticas por plan
   */
  async getStatsByPlan() {
    const stats = await this.prisma.organization.groupBy({
      by: ['plan'],
      where: { deletedAt: null },
      _count: { plan: true },
    });

    return stats.map((stat: any) => ({
      plan: stat.plan,
      count: stat._count.plan,
    }));
  }

  /**
   * Top organizaciones por métrica
   */
  async getTopOrganizations(
    metric: 'executions' | 'workflows' | 'users',
    limit: number = 10,
  ) {
    const organizations = await this.prisma.organization.findMany({
      where: { deletedAt: null },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            users: true,
            workflows: true,
            executions: true,
          },
        },
      },
    });

    // Ordenar por la métrica solicitada
    const sorted = organizations.sort((a, b) => {
      const countA = a._count[metric];
      const countB = b._count[metric];
      return countB - countA;
    });

    return sorted.map(org => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      isActive: org.isActive,
      count: org._count[metric],
      users: org._count.users,
      workflows: org._count.workflows,
      executions: org._count.executions,
    }));
  }
}
