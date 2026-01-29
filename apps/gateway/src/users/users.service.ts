import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UpdateProfileDto, UserFiltersDto, DashboardUserDataDto } from './dto';
import { User, Organization, Prisma } from '@prisma/client';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { CursorPaginatedResponse } from '@workflow-automation/shared-types';
import { CursorPaginatedResponseUtils } from '../common/responses/cursor-paginated-response';
import { InviteUserErrorsDto } from './dto/invite-user-errors.dto';
import { EmailService } from '../notifications/email/email.service';
import { AuthService } from '../auth/auth.service';

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
    private readonly emailService: EmailService,
    private readonly authService: AuthService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

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

    if (existingUser && existingUser.isActive) {
      return InviteUserErrorsDto.USER_ALREADY_REGISTERED;
    }

    const existingVerification = await this.prisma.userVerification.findFirst({
      where: {
        email: email,
      },
    });

    if (existingVerification && existingVerification.expiresAt < new Date()) {
      return InviteUserErrorsDto.USER_ALREADY_INVITED;
    } else if (existingVerification && existingVerification.expiresAt >= new Date()) {
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
      const userVerification = await this.prisma.userVerification.create({
        data: {
          email: email,
          verificationCode: emailSentInfo.verificationCode,
          organizationName: organizationId,
          userName: '',
          isFromInvitation: true,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días para aceptar
        },
      });
      return true;
    } catch (error) {
      this.logger.error(`invite >> Error creating user verification for ${email}: ${error}`);
      return InviteUserErrorsDto.ERROR_SENDING_EMAIL;
    }
  }

  async createUserFromInvitation(
    userName: string,
    pass: string,
    verificationCode: string,
  ): Promise<DashboardUserDataDto | null> {
    const userVerification = await this.prisma.userVerification.findFirst({
      where: { verificationCode },
    });
    if (!userVerification || userVerification.expiresAt < new Date()) {
      return null;
    }

    try {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: userVerification.email },
      });
      if (existingUser) {
        await this.prisma.userVerification.deleteMany({
          where: { verificationCode },
        });
        await this.prisma.user.update({
          where: { email: userVerification.email },
          data: {
            emailVerified: true,
            isActive: true,
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

      const hashedPassword = await this.authService.hashPassword(pass);

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
        where: { verificationCode },
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
        `createUserFromInvitation >> Error creating user from invitation: ${error}`,
      );
      return null;
    }
  }

  async validateEmailUnique(email: string): Promise<boolean> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return false;
    }
    return true;
  }
  /**
   * Reenviar invitación a usuario pendiente
   */
  async resendInvitation(userEmail: string, organizationId: string): Promise<boolean> {
    const userVerification = await this.prisma.userVerification.findFirst({
      where: {
        organizationName: organizationId,
        email: userEmail,
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
    const userVerification = await this.prisma.userVerification.findFirst({
      where: {
        email: userEmail,
      },
    });
    if (!userVerification) {
      this.logger.error(`cancelInvitation >> No pending invitation found for ${userEmail}`);
      return false;
    }
    const deletedRecords = await this.prisma.userVerification.deleteMany({
      where: {
        email: userEmail,
      },
    });
    if (deletedRecords.count === 0) {
      this.logger.error(`cancelInvitation >> Error deleting verification record for ${userEmail}`);
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
  ): Promise<User> {
    // Verificar que el usuario existe y pertenece a la org
    await this.findOne(userId, organizationId);

    // Actualizar solo campos permitidos
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.avatar && { avatar: data.avatar }),
        ...(data.timezone && { timezone: data.timezone }),
      },
    });

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
  async activate(userId: string, organizationId: string): Promise<User> {
    // Verificar que el usuario existe
    await this.findOne(userId, organizationId);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });

    return user;
  }

  /**
   * Desactivar usuario
   */
  async deactivate(userId: string, organizationId: string): Promise<User> {
    // Verificar que el usuario existe
    const user = await this.findOne(userId, organizationId);

    // NO se puede desactivar al owner
    if (user.role === 'owner') {
      throw new ForbiddenException('Cannot deactivate owner. Transfer ownership first.');
    }

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

    // NO se puede eliminar al owner
    await this.validateNotOwner(user);

    // Verificar que el actor tiene permisos
    const actor = await this.findOne(actorId, organizationId);
    if (actor.role !== 'owner' && actor.role !== 'admin') {
      throw new ForbiddenException('Only owner or admin can delete users');
    }

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

  /**
   * Validar que NO se puede eliminar al owner
   */
  private validateNotOwner(user: User): void {
    if (user.role === 'owner') {
      throw new ForbiddenException('Cannot delete owner. Transfer ownership first.');
    }
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

  async getDashboardData(
    organizationId: string,
    cursor?: string | null,
    take: number = 10,
    paginationAction: 'next' | 'prev' | null = null,
    filters?: {
      search?: string;
      role?: string;
      isActive?: boolean;
    },
  ): Promise<CursorPaginatedResponse<DashboardUserDataDto>> {
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
      take:  paginationAction === 'next' || paginationAction === null
          ? take + 1
          : -(take + 1),
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
}
