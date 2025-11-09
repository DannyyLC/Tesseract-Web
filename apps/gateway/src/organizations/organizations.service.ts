import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PLANS, PlanType, canAdd } from '@workflow-automation/shared-types';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

/**
 * Servicio para gestionar organizaciones
 * Solo los propietarios (owners) pueden modificar la organización
 */
@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtiene la información de una organización
   */
  async findOne(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: {
          select: {
            users: true,
            workflows: true,
            apiKeys: true,
          },
        },
      },
    });

    if (!organization) {
      throw new NotFoundException('Organización no encontrada');
    }

    const planConfig = PLANS[organization.plan as PlanType];

    return {
      ...organization,
      planLimits: planConfig,
      usage: {
        users: organization._count.users,
        workflows: organization._count.workflows,
        apiKeys: organization._count.apiKeys,
      },
    };
  }

  /**
   * Actualiza la información de una organización
   * Solo el owner puede actualizar
   */
  async update(organizationId: string, dto: UpdateOrganizationDto) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organización no encontrada');
    }

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        name: dto.name ?? organization.name,
        // El plan solo puede ser actualizado por super admins
        // Por ahora no permitimos cambiar el plan desde aquí
      },
    });

    this.logger.log(`Organización actualizada: ${updated.name}`);

    return updated;
  }

  /**
   * Obtiene las estadísticas de uso de la organización
   */
  async getStats(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: {
          select: {
            users: true,
            workflows: true,
            apiKeys: true,
          },
        },
      },
    });

    if (!organization) {
      throw new NotFoundException('Organización no encontrada');
    }

    const planConfig = PLANS[organization.plan as PlanType];

    // Calcular ejecuciones del día actual
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const executionsToday = await this.prisma.execution.count({
      where: {
        workflow: {
          organizationId,
        },
        createdAt: {
          gte: today,
        },
      },
    });

    return {
      plan: organization.plan,
      limits: planConfig.limits,
      usage: {
        users: {
          current: organization._count.users,
          limit: planConfig.limits.maxUsers,
          percentage: planConfig.limits.maxUsers === -1 ? 0 : (organization._count.users / planConfig.limits.maxUsers) * 100,
        },
        workflows: {
          current: organization._count.workflows,
          limit: planConfig.limits.maxWorkflows,
          percentage: planConfig.limits.maxWorkflows === -1 ? 0 : (organization._count.workflows / planConfig.limits.maxWorkflows) * 100,
        },
        apiKeys: {
          current: organization._count.apiKeys,
          limit: planConfig.limits.maxApiKeys,
          percentage: planConfig.limits.maxApiKeys === -1 ? 0 : (organization._count.apiKeys / planConfig.limits.maxApiKeys) * 100,
        },
        executions: {
          today: executionsToday,
          limit: planConfig.limits.maxExecutionsPerDay,
          percentage: planConfig.limits.maxExecutionsPerDay === -1 ? 0 : (executionsToday / planConfig.limits.maxExecutionsPerDay) * 100,
        },
      },
      canAddUser: canAdd(organization.plan as PlanType, 'maxUsers', organization._count.users),
      canAddWorkflow: canAdd(organization.plan as PlanType, 'maxWorkflows', organization._count.workflows),
    };
  }

  /**
   * Lista todos los miembros de la organización
   */
  async listMembers(organizationId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return users;
  }

  /**
   * Verifica si la organización puede agregar un nuevo usuario
   */
  async canAddUser(organizationId: string): Promise<boolean> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: {
          select: { users: true },
        },
      },
    });

    if (!organization) {
      throw new NotFoundException('Organización no encontrada');
    }

    return canAdd(organization.plan as PlanType, 'maxUsers', organization._count.users);
  }

  /**
   * Verifica si la organización puede agregar un nuevo workflow
   */
  async canAddWorkflow(organizationId: string): Promise<boolean> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: {
          select: { workflows: true },
        },
      },
    });

    if (!organization) {
      throw new NotFoundException('Organización no encontrada');
    }

    return canAdd(organization.plan as PlanType, 'maxWorkflows', organization._count.workflows);
  }

  /**
   * Verifica si la organización puede agregar una nueva API key
   */
  async canAddApiKey(organizationId: string): Promise<boolean> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: {
          select: { apiKeys: true },
        },
      },
    });

    if (!organization) {
      throw new NotFoundException('Organización no encontrada');
    }

    const planConfig = PLANS[organization.plan as PlanType];
    return planConfig.limits.maxApiKeys === -1 || organization._count.apiKeys < planConfig.limits.maxApiKeys;
  }
}
