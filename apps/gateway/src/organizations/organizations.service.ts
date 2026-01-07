import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PLANS, SubscriptionPlan } from '@workflow-automation/shared-types';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { ListOrganizationsDto } from './dto/list-organizations.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateCustomLimitsDto } from './dto/update-custom-limits.dto';
import { randomBytes } from 'crypto';

/**
 * Servicio para gestionar organizaciones
 * Maneja operaciones tanto de usuarios normales (owners) como de super admins
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
  async getStats(organizationId: string, includeAdminData: boolean = false) {
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
          percentage: effectiveLimits.maxUsers === -1 ? 0 : (organization._count.users / effectiveLimits.maxUsers) * 100,
        },
        workflows: {
          current: organization._count.workflows,
          limit: effectiveLimits.maxWorkflows,
          percentage: effectiveLimits.maxWorkflows === -1 ? 0 : (organization._count.workflows / effectiveLimits.maxWorkflows) * 100,
        },
        apiKeys: {
          current: organization._count.apiKeys,
          limit: effectiveLimits.maxApiKeys,
          percentage: effectiveLimits.maxApiKeys === -1 ? 0 : (organization._count.apiKeys / effectiveLimits.maxApiKeys) * 100,
        },
        executions: {
          thisMonth: executionsThisMonth,
        },
      },
      canAddUser: effectiveLimits.maxUsers === -1 || organization._count.users < effectiveLimits.maxUsers,
      canAddWorkflow: effectiveLimits.maxWorkflows === -1 || organization._count.workflows < effectiveLimits.maxWorkflows,
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
    return effectiveLimits.maxWorkflows === -1 || organization._count.workflows < effectiveLimits.maxWorkflows;
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
    return effectiveLimits.maxApiKeys === -1 || organization._count.apiKeys < effectiveLimits.maxApiKeys;
  }

  // ============================================
  // GESTIÓN DE MIEMBROS
  // ============================================
  /**
   * Remueve un miembro de la organización (soft delete)
   * No puede remover al owner si es el único owner
   */
  async removeMember(organizationId: string, userId: string, removedBy: string) {
    // Verificar que el usuario existe y pertenece a la organización
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado en la organización');
    }

    // Verificar que no es el último owner
    if (user.role === 'owner') {
      const ownerCount = await this.prisma.user.count({
        where: {
          organizationId,
          role: 'owner',
          deletedAt: null,
        },
      });

      if (ownerCount === 1) {
        throw new BadRequestException('No se puede eliminar al único owner de la organización');
      }
    }

    // Soft delete
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    this.logger.log(`Usuario ${user.email} removido de organización ${organizationId} por ${removedBy}`);
  }

  /**
   * Actualiza el rol de un miembro
   * No puede cambiar el rol del último owner
   */
  async updateMemberRole(organizationId: string, userId: string, newRole: string, updatedBy: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado en la organización');
    }

    // Si está cambiando de owner a otro rol, verificar que no es el último owner
    if (user.role === 'owner' && newRole !== 'owner') {
      const ownerCount = await this.prisma.user.count({
        where: {
          organizationId,
          role: 'owner',
          deletedAt: null,
        },
      });

      if (ownerCount === 1) {
        throw new BadRequestException('No se puede cambiar el rol del único owner de la organización');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
    });

    this.logger.log(`Rol de ${user.email} actualizado de ${user.role} a ${newRole} por ${updatedBy}`);

    return updated;
  }

  /**
   * Obtiene información detallada de un miembro específico
   */
  async getMember(organizationId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        emailVerified: true,
        twoFactorEnabled: true,
        avatar: true,
        timezone: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado en la organización');
    }

    return user;
  }

  /**
   * Invita un nuevo miembro a la organización
   * Genera un token de invitación y envía email
   */
  async inviteMember(organizationId: string, dto: InviteMemberDto, invitedBy: string) {
    // Verificar que la organización puede agregar más usuarios
    const canAdd = await this.canAddUser(organizationId);
    if (!canAdd) {
      throw new BadRequestException('La organización ha alcanzado el límite de usuarios permitidos');
    }

    // Verificar que el email no esté ya en uso en esta organización
    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: dto.email,
        organizationId,
        deletedAt: null,
      },
    });

    if (existingUser) {
      throw new ConflictException('Este email ya está registrado en la organización');
    }

    // Generar token de invitación (válido por 7 días)
    const invitationToken = randomBytes(32).toString('hex');
    const invitationExpires = new Date();
    invitationExpires.setDate(invitationExpires.getDate() + 7);

    // Crear usuario con estado pendiente de verificación
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name || dto.email.split('@')[0],
        password: '', // Se establecerá cuando acepte la invitación
        role: dto.role,
        organizationId,
        emailVerified: false,
        emailVerificationToken: invitationToken,
        isActive: false, // Inactivo hasta que acepte la invitación
      },
    });

    this.logger.log(`Usuario ${dto.email} invitado a organización ${organizationId} por ${invitedBy} con rol ${dto.role}`);

    // TODO: Enviar email de invitación
    // await this.emailService.sendInvitation(dto.email, invitationToken);

    return {
      ...user,
      invitationUrl: `/accept-invitation?token=${invitationToken}`,
    };
  }

  /**
   * Reenvía la invitación a un usuario pendiente
   */
  async resendInvitation(organizationId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        deletedAt: null,
        emailVerified: false,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado o ya está verificado');
    }

    // Generar nuevo token
    const invitationToken = randomBytes(32).toString('hex');
    const invitationExpires = new Date();
    invitationExpires.setDate(invitationExpires.getDate() + 7);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerificationToken: invitationToken,
      },
    });

    this.logger.log(`Invitación reenviada a ${user.email}`);

    // TODO: Enviar email de invitación
    // await this.emailService.sendInvitation(user.email, invitationToken);

    return {
      message: 'Invitación reenviada exitosamente',
      invitationUrl: `/accept-invitation?token=${invitationToken}`,
    };
  }

  /**
   * Cancela una invitación pendiente (elimina el usuario)
   */
  async cancelInvitation(organizationId: string, userId: string, canceledBy: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        deletedAt: null,
        emailVerified: false,
        isActive: false,
      },
    });

    if (!user) {
      throw new NotFoundException('Invitación no encontrada o usuario ya está activo');
    }

    // Eliminar el usuario (no es un miembro activo todavía)
    await this.prisma.user.delete({
      where: { id: userId },
    });

    this.logger.log(`Invitación a ${user.email} cancelada por ${canceledBy}`);

    return {
      message: 'Invitación cancelada exitosamente',
    };
  }

  /**
   * Activa un miembro desactivado
   */
  async activateMember(organizationId: string, userId: string, activatedBy: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado en la organización');
    }

    if (user.isActive) {
      throw new ConflictException('El usuario ya está activo');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });

    this.logger.log(`Usuario ${user.email} activado por ${activatedBy}`);

    return {
      message: 'Usuario activado exitosamente',
    };
  }

  /**
   * Desactiva un miembro (sin eliminarlo)
   */
  async deactivateMember(organizationId: string, userId: string, deactivatedBy: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado en la organización');
    }

    if (!user.isActive) {
      throw new ConflictException('El usuario ya está desactivado');
    }

    // No se puede desactivar al último owner
    if (user.role === 'owner') {
      const activeOwnerCount = await this.prisma.user.count({
        where: {
          organizationId,
          role: 'owner',
          deletedAt: null,
          isActive: true,
        },
      });

      if (activeOwnerCount === 1) {
        throw new BadRequestException('No se puede desactivar al único owner activo de la organización');
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    this.logger.log(`Usuario ${user.email} desactivado por ${deactivatedBy}`);

    return {
      message: 'Usuario desactivado exitosamente',
    };
  }

  /**
   * Transfiere el ownership de la organización a otro usuario
   */
  async transferOwnership(organizationId: string, dto: TransferOwnershipDto, currentOwnerId: string) {
    // Verificar que el usuario actual es owner
    const currentOwner = await this.prisma.user.findFirst({
      where: {
        id: currentOwnerId,
        organizationId,
        role: 'owner',
        deletedAt: null,
      },
    });

    if (!currentOwner) {
      throw new ForbiddenException('Solo el owner puede transferir el ownership');
    }

    // Verificar que el nuevo owner existe y está activo
    const newOwner = await this.prisma.user.findFirst({
      where: {
        id: dto.newOwnerId,
        organizationId,
        deletedAt: null,
        isActive: true,
      },
    });

    if (!newOwner) {
      throw new NotFoundException('El usuario destino no existe o no está activo en la organización');
    }

    if (newOwner.id === currentOwnerId) {
      throw new BadRequestException('No puedes transferir el ownership a ti mismo');
    }

    // Hacer la transferencia en una transacción
    await this.prisma.$transaction([
      // El owner actual se convierte en admin
      this.prisma.user.update({
        where: { id: currentOwnerId },
        data: { role: 'admin' },
      }),
      // El nuevo usuario se convierte en owner
      this.prisma.user.update({
        where: { id: dto.newOwnerId },
        data: { role: 'owner' },
      }),
    ]);

    this.logger.log(`Ownership transferido de ${currentOwner.email} a ${newOwner.email} en organización ${organizationId}`);

    return {
      message: 'Ownership transferido exitosamente',
      previousOwner: { id: currentOwner.id, email: currentOwner.email },
      newOwner: { id: newOwner.id, email: newOwner.email },
    };
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

    this.logger.log(`Límites custom de organización ${organizationId} actualizados por ${updatedBy}`);

    return {
      ...updated,
      effectiveLimits: this.getEffectiveLimits(updated),
    };
  }

  // ============================================
  // DESACTIVACIÓN / REACTIVACIÓN
  // ============================================
  /**
   * Desactiva una organización temporalmente
   * Puede ser revertido con reactivate()
   */
  async deactivate(organizationId: string, deactivatedBy: string, reason?: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organización no encontrada');
    }

    if ((organization as any).deactivatedAt) {
      throw new ConflictException('La organización ya está desactivada');
    }

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        isActive: false,
        deactivatedAt: new Date() as any,
        deactivatedBy: deactivatedBy as any,
        deactivationReason: reason as any,
      },
    });

    this.logger.warn(`Organización ${organization.name} desactivada por ${deactivatedBy}. Razón: ${reason || 'No especificada'}`);

    return updated;
  }

  /**
   * Reactiva una organización previamente desactivada
   */
  async reactivate(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organización no encontrada');
    }

    if (!(organization as any).deactivatedAt) {
      throw new ConflictException('La organización no está desactivada');
    }

    if (organization.deletedAt) {
      throw new ConflictException('No se puede reactivar una organización eliminada');
    }

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        isActive: true,
        deactivatedAt: null as any,
        deactivatedBy: null as any,
        deactivationReason: null as any,
      },
    });

    this.logger.log(`Organización ${organization.name} reactivada`);

    return updated;
  }


  // ============================================
  // MÉTODOS AUXILIARES
  // ============================================
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
}
