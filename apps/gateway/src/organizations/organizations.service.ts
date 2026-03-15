import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PLANS,
  SubscriptionPlan,
  getPlanLimits,
  SubscriptionPlan as SharedSubscriptionPlan,
} from '@tesseract/types';
import { Organization } from '@tesseract/database';
import { randomBytes } from 'crypto';
import * as speakeasy from 'speakeasy';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../notifications/email/email.service';
import { DashboardUserDataDto } from '../users/dto';
import { InviteUserErrorsDto } from '../users/dto/invite-user-errors.dto';
import { UtilityService } from '../utility/utility.service';
import {
  CreateOrganizationDto,
  DashboardOrganizationDto,
  DashboardSubscriptionDto,
  UpdateCustomLimitsDto,
  UpdateOrganizationDto,
  UpdateOverageSettingsDto,
  UpdateSettingsDto,
} from './dto';

/**
 * Servicio para gestionar organizaciones
 * Maneja operaciones tanto de usuarios normales (owners) como de super admins
 */
@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly emailService: EmailService,
    private readonly utilityService: UtilityService,
  ) {}

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
      this.logger.error(`Error al crear organización "${dto.name}": ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    this.logger.info(`Organización "${organization.name}" creada con ID: ${organization.id}`);

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
  async update(id: string, dto: UpdateOrganizationDto): Promise<Organization | null> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: id },
    });

    if (!organization) {
      return null;
    }

    let updated: Organization | null = null;
    try {
      updated = await this.prisma.organization.update({
        where: { id: id },
        data: {
          name: dto.name ?? organization.name,
          // El plan solo puede ser actualizado por super admins
          // Por ahora no permitimos cambiar el plan desde aquí
        },
      });
    } catch (error) {
      this.logger.error(`Error al actualizar organización "${id}": ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    this.logger.info(`Organización actualizada: ${updated.name}`);

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

    this.logger.info(`Configuración de organización ${organizationId} actualizada`);

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

    this.logger.info(
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

    this.logger.info(
      `Configuración de overages actualizada para organización ${organizationId}: allowOverages=${dto.allowOverages}, overageLimit=${dto.overageLimit}`,
    );

    return updated;
  }

  /**
   * Toggle Overages and Set Limit
   */
  async toggleOverages(
    organizationId: string,
    allowOverages: boolean,
    limit?: number,
  ): Promise<Organization | null> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { subscription: true },
    });

    if (!organization) {
      this.logger.warn(`Organization not found ID: ${organizationId}`);
      return null;
    }

    // 1. Validate if Plan allows Overages (e.g. FREE plan doesn't)
    // We reuse getPlanLimits to check monthlyCredits
    // Cast to SharedSubscriptionPlan to match expected type
    const limits = getPlanLimits(organization.plan as unknown as SharedSubscriptionPlan);

    if (allowOverages && limits.monthlyCredits === 0) {
      throw new BadRequestException(
        'El plan actual no permite habilitar sobregiros (0 créditos mensuales).',
      );
    }

    // 2. Validate user logic: "si esta cancelada la suscripcion... no permita activarla"
    if (allowOverages) {
      if (!organization.subscription) {
        throw new BadRequestException('No se pueden habilitar overages sin una suscripción activa');
      }

      if (
        organization.subscription.status === 'CANCELED' ||
        organization.subscription.status === 'PAST_DUE'
      ) {
        throw new BadRequestException(
          'No se pueden habilitar overages con una suscripción CANCELADA o VENCIDA',
        );
      }

      if (organization.subscription.cancelAtPeriodEnd) {
        throw new BadRequestException(
          'No se pueden habilitar overages cuando la suscripción está programada para cancelarse',
        );
      }
    }

    // 3. Validate Limit Cap
    // Limit can't be greater than monthly credits
    let finalLimit = limit;

    if (allowOverages) {
      if (limit !== undefined && limit !== null) {
        if (limit > limits.monthlyCredits) {
          throw new BadRequestException(
            `El límite de sobregiro (${limit}) no puede exceder los créditos mensuales del plan (${limits.monthlyCredits}).`,
          );
        }
        finalLimit = limit;
      } else if (organization.overageLimit === null) {
        // Default to max if enabling for first time without specific limit
        finalLimit = limits.monthlyCredits;
      }
    } else {
      finalLimit = 0; // Reset logic if disabled
    }

    let updated: Organization | null = null;
    try {
      updated = await this.prisma.organization.update({
        where: { id: organizationId },
        data: {
          allowOverages,
          overageLimit: finalLimit,
        },
      });
    } catch (error) {
      this.logger.error(
        `Error al actualizar overages de organización "${organizationId}": ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }

    this.logger.info(
      `Overages ${allowOverages ? 'enabled' : 'disabled'} for ${organization.name} (Limit: ${finalLimit})`,
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
      this.logger.error(`Error al desactivar organización "${organizationId}": ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    this.logger.info(
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
      this.logger.error(`Error al reactivar organización "${organizationId}": ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    this.logger.info(`Organización ${organization.name} reactivada`);

    return updated;
  }

  /**
   * Soft Delete Organization
   * Marks organization as deleted, effectively removing it from view and access.
   */
  async softDelete(
    organizationId: string,
    userId: string,
    confirmationText: string,
    code2FA?: string,
  ): Promise<Organization | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    // Verificar que el usuario existe
    if (!user) {
      throw new NotFoundException(`No se encontró el usuario con ID: ${userId}`);
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    // Verificar que la organizacion existe
    if (!organization) {
      this.logger.warn(`No se encontró la organización con ID: ${organizationId}`);
      return null;
    }

    // Verificar que el usuario pertenece a la organizacion
    if (user.organizationId !== organizationId) {
      throw new ForbiddenException('El usuario no pertenece a la organizacion');
    }

    // Safety check: Don't double delete
    if (organization.deletedAt) return organization;

    if (user.role !== 'owner') {
      throw new ForbiddenException('No tienes los permisos requeridos');
    }

    // Validar confirmación por nombre
    if (confirmationText !== user.organization.name) {
      throw new BadRequestException('El nombre de la organización no coincide');
    }

    if (user.twoFactorEnabled) {
      if (!code2FA) {
        throw new ForbiddenException('Código 2FA requerido');
      }
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret!,
        encoding: 'base32',
        token: code2FA,
      });

      if (!verified) {
        throw new BadRequestException('Código 2FA inválido');
      }
    }

    let updated: Organization | null = null;
    try {
      updated = await this.prisma.organization.update({
        where: { id: organizationId },
        data: {
          isActive: false,
          deletedAt: new Date(),
        },
      });
      this.logger.info(
        `Organization ${organization.name} (${organizationId}) soft-deleted by user ${userId}`,
      );
    } catch (error) {
      this.logger.error(`Error deleting organization ${organizationId}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
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

  async getDashboardData(organizationId: string): Promise<DashboardOrganizationDto | null> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        plan: true,
        allowOverages: true,
        overageLimit: true,
        isActive: true,
        createdAt: true,
        customMaxUsers: true,
        customMaxApiKeys: true,
        customMaxWorkflows: true,
      },
    });

    if (!organization) {
      this.logger.warn(
        `No se encontró la organización con ID: ${organizationId} para el dashboard`,
      );
      return null;
    }

    const subscriptionData = await this.getSubscriptionData(organizationId);

    return {
      ...organization,
      plan: organization.plan as SubscriptionPlan,
      subscriptionData,
    };
  }

  async getSubscriptionData(organizationId: string): Promise<DashboardSubscriptionDto | null> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { organizationId },
      select: {
        plan: true,
        status: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        customMonthlyPrice: true,
        customMonthlyCredits: true,
        customMaxWorkflows: true,
        customFeatures: true,
      },
    });

    if (!subscription) {
      return null;
    }
    return subscription;
  }

  /**
   * Invitar usuario a la organización
   */
  async invite(organizationId: string, email: string): Promise<boolean | InviteUserErrorsDto> {
    // Validar que la organización existe y está activa
    const isOrganizationValid = await this.validateOrganization(organizationId);

    if (!isOrganizationValid) {
      return InviteUserErrorsDto.ORGANIZATION_NOT_VALID;
    }
    // Validar límite de usuarios del plan
    const isUserLimitValid = await this.validateUserLimit(organizationId);
    if (!isUserLimitValid) {
      return InviteUserErrorsDto.INVITE_LIMIT_EXCEEDED;
    }

    // Validar email único global
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser && !existingUser.deletedAt) {
      await this.emailService.sendOrganizationExistsEmail(email, isOrganizationValid.name);
      return true;
    }

    // Si el usuario está eliminado (deletedAt !== null) o no existe, continuar con invitación normal
    const existingVerification = await this.prisma.userVerification.findFirst({
      where: {
        email: email,
      },
    });

    if (existingVerification && !existingVerification.isFromInvitation) {
      return InviteUserErrorsDto.EMAIL_IN_SINUP_PROGRESS;
    }

    if (existingVerification && existingVerification.expiresAt >= new Date()) {
      return InviteUserErrorsDto.USER_ALREADY_INVITED;
    } else if (existingVerification && existingVerification.expiresAt < new Date()) {
      await this.prisma.userVerification.deleteMany({
        where: {
          email: email,
        },
      });
    }

    const emailSentInfo = await this.emailService.sendOrganizationInvitationToEmail(
      email,
      isOrganizationValid.name,
    );

    if (!emailSentInfo) {
      return InviteUserErrorsDto.ERROR_SENDING_EMAIL;
    }

    try {
      await this.prisma.userVerification.create({
        data: {
          email: email,
          verificationCode: emailSentInfo.verificationCode,
          organizationName: organizationId,
          userName: '',
          isFromInvitation: true,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días para aceptar
        },
      });
      await this.utilityService.sendNotificationToAppClients(
        organizationId,
        ['admin'],
        '0000-0010',
      );
      return true;
    } catch (error) {
      this.logger.error(`invite >> Error creating user verification for ${email}: ${error instanceof Error ? error.message : String(error)}`);
      return InviteUserErrorsDto.ERROR_SENDING_EMAIL;
    }
  }

  // ==================== PRIVATE VALIDATIONS ====================
  /**
   * Validar límite de usuarios del plan
   */
  private async validateUserLimit(organizationId: string): Promise<boolean> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { subscription: true },
    });

    if (!org) {
      return false;
    }

    // Obtener límite del plan
    const planLimits = {
      FREE: 1,
      STARTER: 3,
      GROWTH: 10,
      BUSINESS: 25,
      PRO: 50,
      ENTERPRISE: null, // Sin límite
    };

    const maxUsers = org.customMaxUsers ?? planLimits[org.plan];

    // Si es ENTERPRISE o sin límite, permitir
    if (maxUsers === null) {
      return true;
    }

    // Contar usuarios activos
    const currentUserCount = await this.prisma.user.count({
      where: {
        organizationId,
        deletedAt: null,
      },
    });

    if (currentUserCount >= maxUsers) {
      return false;
    }
    return true;
  }

  /**
   * Validar que la organización existe y está activa
   */
  private async validateOrganization(organizationId: string): Promise<Organization | null> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org || !org.isActive || org.deletedAt || org.deactivatedAt) {
      return null;
    }

    return org;
  }

  async createUserFromInvitation(
    userName: string,
    pass: string,
    verificationCode: string,
  ): Promise<DashboardUserDataDto | null> {
    const userVerification = await this.prisma.userVerification.findFirst({
      where: {
        verificationCode,
        isFromInvitation: true,
      },
    });
    if (!userVerification || userVerification.expiresAt < new Date()) {
      return null;
    }

    try {
      const existingUser = await this.prisma.user.findUnique({
        where: {
          email: userVerification.email,
        },
      });
      if (existingUser) {
        await this.prisma.userVerification.deleteMany({
          where: {
            verificationCode,
            isFromInvitation: true,
          },
        });
        await this.prisma.user.update({
          where: { email: userVerification.email },
          data: {
            emailVerified: true,
            isActive: true,
            organizationId: userVerification.organizationName,
          },
        });
        return {
          email: existingUser.email,
          name: existingUser.name,
          role: existingUser.role,
          isActive: existingUser.isActive,
          lastLoginAt: existingUser.lastLoginAt,
          createdAt: existingUser.createdAt,
          avatar: existingUser.avatar,
          timezone: existingUser.timezone,
          emailVerified: existingUser.emailVerified,
        };
      }

      const hashedPassword = await this.utilityService.hashPassword(pass);

      const newUser = await this.prisma.user.create({
        data: {
          email: userVerification.email,
          name: userName,
          password: hashedPassword,
          organizationId: userVerification.organizationName,
          isActive: true,
          emailVerified: true,
        },
      });
      await this.prisma.userVerification.deleteMany({
        where: {
          verificationCode,
          isFromInvitation: true,
        },
      });
      return {
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        isActive: newUser.isActive,
        lastLoginAt: newUser.lastLoginAt,
        createdAt: newUser.createdAt,
        avatar: newUser.avatar,
        timezone: newUser.timezone,
        emailVerified: newUser.emailVerified,
      };
    } catch (error) {
      this.logger.error(
        `createUserFromInvitation >> Error creating user from invitation: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Reenviar invitación a usuario pendiente
   */
  async resendInvitation(userEmail: string, organizationId: string): Promise<boolean> {
    const userVerification = await this.prisma.userVerification.findFirst({
      where: {
        organizationName: organizationId,
        email: userEmail,
        isFromInvitation: true,
      },
    });
    if (!userVerification) {
      this.logger.error(
        `resendInvitation >> No pending invitation found for ${userEmail} in org ${organizationId}`,
      );
      return false;
    }
    const emailSentInfo = await this.emailService.sendOrganizationInvitationToEmail(
      userEmail,
      organizationId,
    );
    if (!emailSentInfo) {
      this.logger.error(`resendInvitation >> Error sending invitation email to ${userEmail}`);
      return false;
    }

    const modifiedRecords = await this.prisma.userVerification.updateMany({
      where: {
        email: userEmail,
      },
      data: {
        verificationCode: emailSentInfo.verificationCode,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días para aceptar
      },
    });
    if (modifiedRecords.count === 0) {
      this.logger.error(`resendInvitation >> Error updating verification record for ${userEmail}`);
      return false;
    }

    return true;
  }

  /**
   * Cancelar invitación pendiente (elimina el usuario que nunca aceptó)
   */
  async cancelInvitation(userEmail: string): Promise<boolean> {
    const deletedRecords = await this.prisma.userVerification.deleteMany({
      where: {
        email: userEmail,
        isFromInvitation: true,
      },
    });
    if (deletedRecords.count === 0) {
      this.logger.error(`cancelInvitation >> No pending invitation found for ${userEmail}`);
      return false;
    }

    return true;
  }
}
