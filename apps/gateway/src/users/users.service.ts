import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PaginatedResponse } from '@tesseract/types';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { CursorPaginatedResponseUtils } from '../common/responses/cursor-paginated-response';
import { PrismaService } from '../database/prisma.service';
import { NotificationEventDto } from '../events/app-notifications/notification.dto';
import { notificationsEnum } from '../events/app-notifications/notifications.enum';
import { EmailService } from '../notifications/email/email.service';
import { DashboardUserDataDto, UpdateProfileDto, UserFiltersDto } from './dto';

interface PaginatedUsers {
  data: User[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
interface UserStats {
  total: number;
  byRole: {
    viewer: number;
    admin: number;
    owner: number;
  };
  active: number;
  inactive: number;
  verified: number;
  unverified: number;
}
interface UserActivity {
  totalExecutions: number;
  activeConversations: number;
  lastLoginAt: Date | null;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly emailService: EmailService,
  ) {}

  async validateEmailUnique(email: string): Promise<boolean> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return false;
    }
    return true;
  }

  // ==================== READ ====================
  /**
   * Obtener usuario por ID (solo si pertenece a la org)
   */
  async findOne(userId: string, organizationId: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        deletedAt: null,
      },
      include: {
        organization: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Listar usuarios de la organización con filtros
   */
  async findAll(organizationId: string, filters: UserFiltersDto): Promise<PaginatedUsers> {
    const { role, isActive, search, page = 1, limit = 10 } = filters;

    // Construir condiciones de búsqueda
    const where: Prisma.UserWhereInput = {
      organizationId,
      deletedAt: null,
      ...(role && { role }),
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    // Contar total
    const total = await this.prisma.user.count({ where });

    // Obtener usuarios paginados
    const users = await this.prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Buscar usuario por email (dentro de la org)
   */
  async findByEmail(email: string, organizationId: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        email,
        organizationId,
        deletedAt: null,
      },
    });
  }

  /**
   * Contar usuarios activos de la organización
   */
  async count(organizationId: string, filters?: { isActive?: boolean }): Promise<number> {
    return this.prisma.user.count({
      where: {
        organizationId,
        deletedAt: null,
        ...(filters?.isActive !== undefined && { isActive: filters.isActive }),
      },
    });
  }

  // ==================== UPDATE ====================
  /**
   * Actualizar perfil del usuario (self-service)
   */
  async updateProfile(
    userId: string,
    organizationId: string,
    data: UpdateProfileDto,
  ): Promise<User | null> {
    let user = null;
    try {
      // Verificar que el usuario existe y pertenece a la org
      await this.findOne(userId, organizationId);

      // Actualizar solo campos permitidos
      user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.avatar && { avatar: data.avatar }),
          ...(data.timezone && { timezone: data.timezone }),
        },
      });
    } catch (error) {
      this.logger.error(`Error updating user profile for userId ${userId}: ${error}`);
    }

    return user;
  }

  /**
   * Actualizar rol del usuario (solo admin/owner)
   */
  async updateRole(
    userId: string,
    organizationId: string,
    newRole: string,
    actorId: string,
  ): Promise<User> {
    // Verificar que el usuario target existe
    const targetUser = await this.findOne(userId, organizationId);

    // Verificar que el actor existe y obtener su rol
    const actor = await this.findOne(actorId, organizationId);

    // Validar jerarquía de roles
    this.validateRoleHierarchy(actor.role, targetUser.role, newRole);

    // NO se puede asignar rol 'super_admin' ni 'owner'
    if (newRole === 'super_admin' || newRole === 'owner') {
      throw new ForbiddenException(
        `Cannot assign ${newRole} role. This role can only be assigned through system configuration.`,
      );
    }

    // Actualizar rol
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
    });

    return user;
  }

  /**
   * Activar usuario
   */
  async activate(userId: string, organizationId: string, actorId: string): Promise<User> {
    // Verificar que el usuario existe
    const user = await this.findOne(userId, organizationId);

    // Verificar permisos del actor
    const actor = await this.findOne(actorId, organizationId);
    this.validateActionPermission(actor.role, user.role);

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });

    return updatedUser;
  }

  /**
   * Desactivar usuario
   */
  async deactivate(userId: string, organizationId: string, actorId: string): Promise<User> {
    // Verificar que el usuario existe
    const user = await this.findOne(userId, organizationId);

    // Verificar permisos del actor
    const actor = await this.findOne(actorId, organizationId);
    this.validateActionPermission(actor.role, user.role);

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    return updatedUser;
  }

  /**
   * Transferir ownership de la organización
   */
  async transferOwnership(
    currentOwnerId: string,
    newOwnerId: string,
    organizationId: string,
  ): Promise<void> {
    // Verificar que ambos usuarios existen
    const currentOwner = await this.findOne(currentOwnerId, organizationId);
    const newOwner = await this.findOne(newOwnerId, organizationId);

    // Validar que el usuario actual es owner
    if (currentOwner.role !== 'owner') {
      throw new ForbiddenException('Current user is not the owner');
    }

    // Validar que el nuevo owner está activo
    if (!newOwner.isActive) {
      throw new BadRequestException('New owner must be an active user');
    }

    // Transacción atómica
    await this.prisma.$transaction([
      // Cambiar owner actual a admin
      this.prisma.user.update({
        where: { id: currentOwnerId },
        data: { role: 'admin' },
      }),
      // Cambiar nuevo usuario a owner
      this.prisma.user.update({
        where: { id: newOwnerId },
        data: { role: 'owner' },
      }),
    ]);
  }

  /**
   * Actualizar último login (llamado desde auth module)
   */
  async updateLastLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  // ==================== DELETE ====================
  /**
   * Soft delete - Eliminación lógica
   */
  async remove(userId: string, organizationId: string, actorId: string): Promise<void> {
    // Verificar que el usuario existe
    const user = await this.findOne(userId, organizationId);

    // Verificar permisos del actor
    const actor = await this.findOne(actorId, organizationId);

    // Validar permisos (incluye protección de Owner y jerk arquía)
    this.validateActionPermission(actor.role, user.role);

    // Soft delete
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Restaurar usuario eliminado
   */
  async restore(userId: string, organizationId: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.deletedAt) {
      throw new BadRequestException('User is not deleted');
    }

    const restoredUser = await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: null },
    });

    return restoredUser;
  }

  // ==================== ANALYTICS ====================
  /**
   * Estadísticas de usuarios de la organización
   */
  async getStats(organizationId: string): Promise<UserStats> {
    const [total, byRole, active, inactive, verified, unverified] = await Promise.all([
      // Total usuarios
      this.prisma.user.count({
        where: { organizationId, deletedAt: null },
      }),
      // Por rol
      this.prisma.user.groupBy({
        by: ['role'],
        where: { organizationId, deletedAt: null },
        _count: true,
      }),
      // Activos
      this.prisma.user.count({
        where: { organizationId, deletedAt: null, isActive: true },
      }),
      // Inactivos
      this.prisma.user.count({
        where: { organizationId, deletedAt: null, isActive: false },
      }),
      // Verificados
      this.prisma.user.count({
        where: { organizationId, deletedAt: null, emailVerified: true },
      }),
      // No verificados
      this.prisma.user.count({
        where: { organizationId, deletedAt: null, emailVerified: false },
      }),
    ]);

    // Transformar byRole a objeto
    const roleStats = byRole.reduce(
      (acc, item) => {
        const role = item.role as 'viewer' | 'admin' | 'owner';
        acc[role] = item._count;
        return acc;
      },
      { viewer: 0, admin: 0, owner: 0 } as {
        viewer: number;
        admin: number;
        owner: number;
      },
    );

    return {
      total,
      byRole: roleStats,
      active,
      inactive,
      verified,
      unverified,
    };
  }

  /**
   * Usuarios inactivos (sin login en X días)
   */
  async findInactive(organizationId: string, days: number): Promise<User[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return this.prisma.user.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [{ lastLoginAt: { lt: cutoffDate } }, { lastLoginAt: null }],
      },
      orderBy: { lastLoginAt: 'asc' },
    });
  }

  /**
   * Actividad del usuario (dentro de su org)
   */
  async getUserActivity(userId: string, organizationId: string): Promise<UserActivity> {
    // Verificar que el usuario existe
    const user = await this.findOne(userId, organizationId);

    const [totalExecutions, activeConversations] = await Promise.all([
      this.prisma.execution.count({
        where: {
          userId,
          organizationId,
        },
      }),
      this.prisma.conversation.count({
        where: {
          userId,
          status: 'active',
        },
      }),
    ]);

    return {
      totalExecutions,
      activeConversations,
      lastLoginAt: user.lastLoginAt,
    };
  }

  /**
   * Validar jerarquía de roles
   * owner > admin > editor > viewer
   */
  private validateRoleHierarchy(
    actorRole: string,
    targetCurrentRole: string,
    targetNewRole: string,
  ): void {
    const hierarchy: Record<string, number> = {
      super_admin: 5,
      owner: 4,
      admin: 3,
      viewer: 1,
    };

    const actorLevel = hierarchy[actorRole] || 0;
    const targetCurrentLevel = hierarchy[targetCurrentRole] || 0;
    const targetNewLevel = hierarchy[targetNewRole] || 0;

    // Solo owner puede modificar a owner
    if (targetCurrentRole === 'owner' && actorRole !== 'owner') {
      throw new ForbiddenException('Only owner can modify owner role');
    }

    // Admin no puede asignar roles superiores a su nivel
    if (actorRole === 'admin' && targetNewLevel >= hierarchy.admin) {
      throw new ForbiddenException('Admin cannot assign admin or owner roles');
    }

    // El actor debe tener nivel superior al target
    if (actorLevel <= targetCurrentLevel) {
      throw new ForbiddenException('Insufficient permissions to modify this user');
    }
  }

  async getDashboardData(
    organizationId: string,
    cursor?: string | null,
    take = 10,
    paginationAction: 'next' | 'prev' | null = null,
    filters?: {
      search?: string;
      role?: string;
      isActive?: boolean;
    },
  ): Promise<PaginatedResponse<DashboardUserDataDto>> {
    const where: Prisma.UserWhereInput = {
      organizationId,
      deletedAt: null,
      ...(filters?.isActive !== undefined && { isActive: filters.isActive }),
      ...(filters?.role && { role: filters.role }),
      ...(filters?.search && {
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
        ],
      }),
    };

    const users = await this.prisma.user.findMany({
      take: paginationAction === 'next' || paginationAction === null ? take + 1 : -(take + 1),
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        avatar: true,
        timezone: true,
        emailVerified: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (users.length === 0 && !cursor) {
      // Only log if it's an initial load and truly empty, or maybe not needed at all if just filtering results in empty set
      // Keeping original behavior but refining condition slightly or removing log if it's just no results found
      // this.logger.log(`getDashboardData method >> No users found for ID: ${organizationId} with filters: ${JSON.stringify(filters)}`);
    }

    const paginatedUserRes = await CursorPaginatedResponseUtils.getInstance().build(
      users,
      take,
      paginationAction,
    );

    // Convert to DTO manually if needed or just return matching shape since we selected fields
    const items = paginatedUserRes.items.map((user) => {
      // Create a clean object conforming to DashboardUserDataDto
      // Note: user here has exact fields from select above.
      // We are no longer removing ID as it is now required in the DTO
      return user as DashboardUserDataDto;
    });

    return {
      items: items,
      nextCursor: paginatedUserRes.nextCursor,
      prevCursor: paginatedUserRes.prevCursor,
      nextPageAvailable: paginatedUserRes.nextPageAvailable,
      pageSize: paginatedUserRes.pageSize,
    };
  }

  /**
   * Validar permisos para acciones (activate, deactivate, remove)
   * Permite Admin vs Admin
   */
  private validateActionPermission(actorRole: string, targetRole: string): void {
    // 1. Solo admin y owner pueden ejecutar acciones
    if (actorRole !== 'owner' && actorRole !== 'admin') {
      throw new ForbiddenException('Only owner or admin can perform this action');
    }

    // 2. Nadie puede modificar al owner
    if (targetRole === 'owner') {
      throw new ForbiddenException('Cannot modify owner. Transfer ownership first.');
    }

    const hierarchy: Record<string, number> = {
      super_admin: 5,
      owner: 4,
      admin: 3,
      viewer: 1,
    };

    const actorLevel = hierarchy[actorRole] || 0;
    const targetLevel = hierarchy[targetRole] || 0;

    // 3. Jerarguía: actor debe ser >= target
    if (actorLevel < targetLevel) {
      throw new ForbiddenException('Insufficient permissions to modify this user');
    }
  }

  /**
   * Leave organization (self-service)
   * User voluntarily leaves their current organization
   */
  async leaveOrganization(
    userId: string,
    organizationId: string,
    confirmationText: string,
    code2FA?: string,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    // 1. Validar que el usuario existe
    if (!user || user.organizationId !== organizationId) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // 2. Validar que NO es Owner
    if (user.role === 'owner') {
      throw new BadRequestException(
        'El propietario no puede abandonar la organización. Transfiere la propiedad primero.',
      );
    }

    // 3. Validar confirmación por nombre
    if (confirmationText !== user.organization.name) {
      throw new BadRequestException('El nombre de la organización no coincide');
    }

    // 4. Validar 2FA si está habilitado
    if (user.twoFactorEnabled) {
      if (!code2FA) {
        throw new ForbiddenException('Código 2FA requerido');
      }

      const speakeasy = require('speakeasy');
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret!,
        encoding: 'base32',
        token: code2FA,
      });

      if (!verified) {
        throw new BadRequestException('Código 2FA inválido');
      }
    }

    // 5. Soft-delete del usuario
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    // 6. Log de auditoría
    this.logger.info(`User ${user.email} left organization ${user.organization.name} voluntarily`);

    return {
      message: 'Has abandonado la organización exitosamente.',
    };
  }

  async getNotificationsForUser(
    userId: string,
    organizationId: string,
    cursor?: string | null,
    pageSize = 10,
  ): Promise<PaginatedResponse<NotificationEventDto>> {
    const where: Prisma.UserNotificationWhereInput = {
      userId,
      organizationId,
      deletedAt: null,
    };

    const userNotifications = await this.prisma.userNotification.findMany({
      take: pageSize + 1, // Fetch one extra to determine if next page exists
      cursor: cursor ? { id: cursor } : undefined,
      where,
      include: {
        notification: true,
      },
      orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
    });

    const paginatedResponse = await CursorPaginatedResponseUtils.getInstance().build(
      userNotifications,
      pageSize,
      null, // action not needed for simple next/prev based purely on ID cursor
    );

    const items = paginatedResponse.items.map((userNotification) => {
      const code = userNotification.notification.code;
      const params = (userNotification.parameters as string[]) || [];

      let title = '';
      let desc = '';

      if (notificationsEnum[code as keyof typeof notificationsEnum]) {
        title = notificationsEnum[code as keyof typeof notificationsEnum].title;
        let baseDesc = notificationsEnum[code as keyof typeof notificationsEnum].desc;

        // Replace %s with parameters
        if (params.length > 0) {
          params.forEach((param) => {
            baseDesc = baseDesc.replace('%s', param);
          });
        }
        desc = baseDesc;
      } else {
        // Fallback if code not found in enum
        title = 'Notificación';
        desc = 'Tienes una nueva notificación.';
      }

      return {
        id: userNotification.id, // Now using the unique UUID of the UserNotification
        notificationCode: code,
        isRead: userNotification.isRead,
        title,
        desc,
        createdAt: userNotification.createdAt,
      };
    });

    return {
      items,
      nextCursor: paginatedResponse.nextCursor,
      prevCursor: paginatedResponse.prevCursor,
      nextPageAvailable: paginatedResponse.nextPageAvailable,
      pageSize: paginatedResponse.pageSize,
    };
  }

  async getUnreadNotificationsCount(userId: string, organizationId: string): Promise<number> {
    return this.prisma.userNotification.count({
      where: {
        userId,
        organizationId,
        isRead: false,
        deletedAt: null,
      },
    });
  }

  async markNotificationAsRead(
    userId: string,
    organizationId: string,
    notificationId: string,
  ): Promise<void> {
    await this.prisma.userNotification.updateMany({
      where: {
        id: notificationId,
        userId,
        organizationId,
      },
      data: {
        isRead: true,
      },
    });
  }

  async markAllNotificationsAsRead(userId: string, organizationId: string): Promise<void> {
    await this.prisma.userNotification.updateMany({
      where: {
        userId,
        organizationId,
        isRead: false,
        deletedAt: null,
      },
      data: {
        isRead: true,
      },
    });
  }

  async deleteNotification(
    userId: string,
    organizationId: string,
    notificationId: string,
  ): Promise<void> {
    await this.prisma.userNotification.updateMany({
      where: {
        id: notificationId,
        userId,
        organizationId,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async requestServiceInfoByEmail(
    userName: string,
    email: string,
    subject: string,
    userMessage: string,
    organizationId: string,
  ): Promise<boolean> {
    try {
      // 1. Obtener nombre de la organización
      // Podríamos confiar en que el usuario tiene org, pero validamos por seguridad
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      });

      const organizationName = organization?.name || 'Organización desconocida';

      // 2. Obtener fecha y hora actual
      // Formato legible: DD/MM/YYYY HH:MM:SS (o similar)
      const now = new Date();
      const dateString = now.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const timeString = now.toLocaleTimeString('es-ES');
      const dateTime = `${dateString} a las ${timeString}`;

      const emailResult = await this.emailService.sendServiceRequestEmail(
        process.env.SMTP_VERIFIED_EMAIL_FROM || 'verified-email@yourdomain.com',
        process.env.SMTP_EMAIL_FROM || 'fractaliaindustries@gmail.com',
        email,
        userName,
        subject,
        userMessage,
        organizationName,
        dateTime,
      );
      if (!emailResult) {
        this.logger.error(`Failed to send service information request email for user ${email}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error('Error sending service information request email', error);
      return false;
    }
  }
}
