import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PLANS, SubscriptionPlan } from '@workflow-automation/shared-types';
import {
  CreateOrganizationDto,
  UpdateCustomLimitsDto,
  UpdateOrganizationDto,
  UpdateOverageSettingsDto,
  UpdateSettingsDto,
} from './dto';
import { randomBytes } from 'crypto';
import { OrganizationDashboardDto } from './dto/organization-dashboard.dto';
import { Organization } from '@workflow-platform/database';
import { DashboardSubscriptionDto } from './dto/dashboard-subscription.dto';

/**
 * Servicio para gestionar organizaciones
 * Maneja operaciones tanto de usuarios normales (owners) como de super admins
 */
@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // CREATE
  // ============================================
  /**
   * Crea una nueva organización
   */
  async create(dto: CreateOrganizationDto): Promise<Organization | null> {
    let organization: Organization | null = null;
    try {
      // Generar slug único desde el nombre
      // El slug es para URLs amigables (ej: mycompany.tesseract.app)
      // pero múltiples organizaciones pueden tener el mismo nombre
      const slug = await OrganizationsService.generateUniqueSlug(dto.name, this.prisma);

      // Crear organización
      organization = await this.prisma.organization.create({
        data: {
          name: dto.name,
          slug,
          plan: dto.plan ?? 'FREE',
          isActive: true,
          allowOverages: false,
        },
      });
    } catch (error) {
      this.logger.error(`Error al crear organización "${dto.name}": ${error}`);
      return null;
    }

    this.logger.log(`Organización "${organization.name}" creada con ID: ${organization.id}`);

    return organization;
  }

  // ============================================
  // READ
  // ============================================
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

    const planConfig = PLANS[organization.plan];

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
  async update(dto: UpdateOrganizationDto): Promise<Organization | null> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: dto.id },
    });

    if (!organization) {
      return null;
    }

    let updated: Organization | null = null;
    try {
      updated = await this.prisma.organization.update({
        where: { id: dto.id },
        data: {
          name: dto.name ?? organization.name,
          // El plan solo puede ser actualizado por super admins
          // Por ahora no permitimos cambiar el plan desde aquí
        },
      });
    } catch (error) {
      this.logger.error(`Error al actualizar organización "${dto.id}": ${error}`);
      return null;
    }

    this.logger.log(`Organización actualizada: ${updated.name}`);

    return updated;
  }

  /**
   * Obtiene las estadísticas de uso de la organización
   */
  async getStats(organizationId: string, includeAdminData = false) {
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
        creditBalance: includeAdminData,
        subscription: includeAdminData,
      },
    });

    if (!organization) {
      throw new NotFoundException('Organización no encontrada');
    }

    // Obtener límites efectivos (con overrides)
    const effectiveLimits = this.getEffectiveLimits(organization);

    // Calcular ejecuciones del mes actual (no del día, porque no hay límite diario)
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const executionsThisMonth = await this.prisma.execution.count({
      where: {
        workflow: {
          organizationId,
        },
        createdAt: {
          gte: firstDayOfMonth,
        },
      },
    });

    const stats: any = {
      plan: organization.plan,
      limits: effectiveLimits,
      usage: {
        users: {
          current: organization._count.users,
          limit: effectiveLimits.maxUsers,
          percentage:
            effectiveLimits.maxUsers === -1
              ? 0
              : (organization._count.users / effectiveLimits.maxUsers) * 100,
        },
        workflows: {
          current: organization._count.workflows,
          limit: effectiveLimits.maxWorkflows,
          percentage:
            effectiveLimits.maxWorkflows === -1
              ? 0
              : (organization._count.workflows / effectiveLimits.maxWorkflows) * 100,
        },
        apiKeys: {
          current: organization._count.apiKeys,
          limit: effectiveLimits.maxApiKeys,
          percentage:
            effectiveLimits.maxApiKeys === -1
              ? 0
              : (organization._count.apiKeys / effectiveLimits.maxApiKeys) * 100,
        },
        executions: {
          thisMonth: executionsThisMonth,
        },
      },
      canAddUser:
        effectiveLimits.maxUsers === -1 || organization._count.users < effectiveLimits.maxUsers,
      canAddWorkflow:
        effectiveLimits.maxWorkflows === -1 ||
        organization._count.workflows < effectiveLimits.maxWorkflows,
    };

    // Datos solo para super admins
    if (includeAdminData && organization.creditBalance) {
      stats.adminData = {
        creditBalance: organization.creditBalance.balance,
        lifetimeEarned: organization.creditBalance.lifetimeEarned,
        lifetimeSpent: organization.creditBalance.lifetimeSpent,
        currentMonthCostUSD: organization.creditBalance.currentMonthCostUSD,
        currentMonthSpent: organization.creditBalance.currentMonthSpent,
        allowOverages: organization.allowOverages,
        overageLimit: organization.overageLimit,
        deactivatedAt: (organization as any).deactivatedAt,
        deactivatedBy: (organization as any).deactivatedBy,
        deactivationReason: (organization as any).deactivationReason,
        stripeCustomerId: organization.stripeCustomerId,
      };

      if (organization.subscription) {
        stats.adminData.subscription = {
          status: organization.subscription.status,
          currentPeriodStart: organization.subscription.currentPeriodStart,
          currentPeriodEnd: organization.subscription.currentPeriodEnd,
          pendingPlanChange: (organization.subscription as any).pendingPlanChange,
          planChangeRequestedAt: (organization.subscription as any).planChangeRequestedAt,
        };
      }
    }

    return stats;
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

    const effectiveLimits = this.getEffectiveLimits(organization);
    return effectiveLimits.maxUsers === -1 || organization._count.users < effectiveLimits.maxUsers;
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

    const effectiveLimits = this.getEffectiveLimits(organization);
    return (
      effectiveLimits.maxWorkflows === -1 ||
      organization._count.workflows < effectiveLimits.maxWorkflows
    );
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

    const effectiveLimits = this.getEffectiveLimits(organization);
    return (
      effectiveLimits.maxApiKeys === -1 || organization._count.apiKeys < effectiveLimits.maxApiKeys
    );
  }

  // ============================================
  // CONFIGURACIÓN DE ORGANIZACIÓN
  // ============================================
  /**
   * Actualiza la configuración general de la organización
   */
  async updateSettings(organizationId: string, dto: UpdateSettingsDto) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organización no encontrada');
    }

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        defaultMaxMessages: dto.defaultMaxMessages,
        defaultInactivityHours: dto.defaultInactivityHours,
        defaultMaxCostPerConv: dto.defaultMaxCostPerConv,
      },
    });

    this.logger.log(`Configuración de organización ${organizationId} actualizada`);

    return updated;
  }

  /**
   * Actualiza los límites custom de una organización (solo super admins)
   */
  async updateCustomLimits(organizationId: string, dto: UpdateCustomLimitsDto, updatedBy: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organización no encontrada');
    }

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        customMaxUsers: dto.customMaxUsers,
        customMaxWorkflows: dto.customMaxWorkflows,
        customMaxApiKeys: dto.customMaxApiKeys,
      },
    });

    this.logger.log(
      `Límites custom de organización ${organizationId} actualizados por ${updatedBy}`,
    );

    return {
      ...updated,
      effectiveLimits: this.getEffectiveLimits(updated),
    };
  }

  /**
   * Actualiza la configuración de overages de una organización
   * Reglas:
   * - Solo puede tener overages si tiene suscripción activa
   * - El overageLimit máximo es igual a los créditos mensuales del plan
   *   (ej: plan con 150 créditos → máximo -150 de overage)
   */
  async updateOverageSettings(organizationId: string, dto: UpdateOverageSettingsDto) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        subscription: true,
      },
    });

    if (!organization) {
      throw new NotFoundException('Organización no encontrada');
    }

    // Si quiere habilitar overages, debe tener suscripción activa
    if (dto.allowOverages && !organization.subscription) {
      throw new BadRequestException('No se pueden habilitar overages sin una suscripción activa');
    }

    // Si se proporciona overageLimit, validar que no exceda el límite del plan
    if (dto.overageLimit !== undefined && dto.overageLimit !== null) {
      const planLimits = PLANS[organization.plan as SubscriptionPlan].limits;
      const maxOverage = planLimits.monthlyCredits;

      if (dto.overageLimit > maxOverage) {
        throw new BadRequestException(
          `El overageLimit no puede exceder los créditos mensuales del plan (${maxOverage} créditos)`,
        );
      }
    }

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        allowOverages: dto.allowOverages,
        overageLimit: dto.overageLimit,
      },
    });

    this.logger.log(
      `Configuración de overages actualizada para organización ${organizationId}: allowOverages=${dto.allowOverages}, overageLimit=${dto.overageLimit}`,
    );

    return updated;
  }

  // ============================================
  // DESACTIVACIÓN / REACTIVACIÓN
  // ============================================
  /**
   * Desactiva una organización temporalmente
   * Puede ser revertido con reactivate()
   */
  async deactivate(
    organizationId: string,
    deactivatedBy: string,
    reason?: string,
  ): Promise<Organization | null> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      this.logger.warn(`No se encontró la organización con ID: ${organizationId}`);
      return null;
    }

    if (organization.deactivatedAt) {
      this.logger.warn(`La organización "${organizationId}" ya está desactivada`);
      return null;
    }

    let updated: Organization | null = null;
    try {
      updated = await this.prisma.organization.update({
        where: { id: organizationId },
        data: {
          isActive: false,
          deactivatedAt: new Date() as any,
          deactivatedBy: deactivatedBy as any,
          deactivationReason: reason as any,
        },
      });
    } catch (error) {
      this.logger.error(`Error al desactivar organización "${organizationId}": ${error}`);
      return null;
    }

    this.logger.warn(
      `Organización ${organization.name} desactivada por ${deactivatedBy}. Razón: ${reason ?? 'No especificada'}`,
    );

    return updated;
  }

  /**
   * Reactiva una organización previamente desactivada
   */
  async reactivate(organizationId: string): Promise<Organization | null> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      this.logger.warn(`No se encontró la organización con ID: ${organizationId}`);
      return null;
    }

    if (!organization.deactivatedAt) {
      this.logger.warn(`La organización "${organizationId}" no está desactivada`);
      return null;
    }

    if (organization.deletedAt) {
      this.logger.warn(
        `La organización "${organizationId}" está eliminada y no puede ser reactivada`,
      );
      return null;
    }

    let updated: Organization | null = null;
    try {
      updated = await this.prisma.organization.update({
        where: { id: organizationId },
        data: {
          isActive: true,
          deactivatedAt: null as any,
          deactivatedBy: null as any,
          deactivationReason: null as any,
        },
      });
    } catch (error) {
      this.logger.error(`Error al reactivar organización "${organizationId}": ${error}`);
      return null;
    }

    this.logger.log(`Organización ${organization.name} reactivada`);

    return updated;
  }

  // ============================================
  // MÉTODOS AUXILIARES
  // ============================================
  /**
   * Genera un slug base desde el nombre de la organización
   */
  static generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Eliminar caracteres especiales
      .replace(/[\s_]+/g, '-') // Reemplazar espacios y guiones bajos con guión
      .replace(/^-+|-+$/g, ''); // Eliminar guiones al inicio/final
  }

  /**
   * Genera un slug único intentando primero el slug base
   * Si ya existe, agrega un sufijo aleatorio corto (6 caracteres)
   * Reintenta hasta 10 veces si hay colisión (probabilidad extremadamente baja)
   *
   * Método estático que acepta un cliente de Prisma (normal o transacción)
   * para poder ser usado desde otros servicios dentro de transacciones
   *
   * @param name - Nombre de la organización
   * @param prismaClient - Cliente de Prisma (this.prisma o tx)
   * @returns Slug único
   */
  static async generateUniqueSlug(name: string, prismaClient: any): Promise<string> {
    const baseSlug = OrganizationsService.generateSlug(name);

    // Intentar primero con el slug base
    const existingOrg = await prismaClient.organization.findUnique({
      where: { slug: baseSlug },
    });

    if (!existingOrg) {
      return baseSlug;
    }

    // Si existe, intentar con sufijos aleatorios hasta encontrar uno disponible
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const randomSuffix = randomBytes(3).toString('hex'); // 6 caracteres hex
      const candidateSlug = `${baseSlug}-${randomSuffix}`;

      const exists = await prismaClient.organization.findUnique({
        where: { slug: candidateSlug },
      });

      if (!exists) {
        return candidateSlug;
      }
    }

    // Si después de 10 intentos no encuentra, usar timestamp como fallback
    // Probabilidad de llegar aquí: ~0.0000006% (prácticamente imposible)
    const timestampSuffix = Date.now().toString(36); // Base36 más corto
    return `${baseSlug}-${timestampSuffix}`;
  }

  /**
   * Obtiene los límites efectivos de una organización
   * Combina los límites del plan con los overrides custom
   */
  private getEffectiveLimits(organization: any) {
    const planDefaults = PLANS[organization.plan as SubscriptionPlan].limits;

    return {
      maxUsers: organization.customMaxUsers ?? planDefaults.maxUsers,
      maxWorkflows: organization.customMaxWorkflows ?? planDefaults.maxWorkflows,
      maxApiKeys: organization.customMaxApiKeys ?? planDefaults.maxApiKeys,
      monthlyCredits: planDefaults.monthlyCredits,
      overageLimit: organization.overageLimit ?? planDefaults.overageLimit,
      allowOverages: organization.allowOverages ?? planDefaults.allowOverages,
    };
  }

  async getDashboardData(organizationId: string): Promise<OrganizationDashboardDto | null> {
    let organizationDataForDashboard: OrganizationDashboardDto | null = null;

    organizationDataForDashboard = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        plan: true,
        allowOverages: true,
        isActive: true,
        createdAt: true,
        customMaxUsers: true,
        customMaxApiKeys: true,
        customMaxWorkflows: true,
      },
    });

    if (!organizationDataForDashboard) {
      this.logger.warn(
        `No se encontró la organización con ID: ${organizationId} para el dashboard`,
      );
      return null;
    }
    return organizationDataForDashboard;
  }

  async getSubscriptionData(organizationId: string): Promise<DashboardSubscriptionDto | null> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { organizationId },
      select: {
        id: true,
        plan: true,
        status: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        pendingPlanChange: true,
        planChangeRequestedAt: true,
        customMonthlyPrice: true,
        customMonthlyCredits: true,
        customMaxWorkflows: true,
        customFeatures: true,
      },
    });

    if (!subscription) {
      this.logger.error(
        `getDashboardData method >> No subscription found for organization ${organizationId}`,
      );
      return null;
    }
    return subscription;
  }
}
