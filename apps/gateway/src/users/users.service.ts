import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  CreateOwnerDto,
  CreateUserDto,
  InviteUserDto,
  UpdateProfileDto,
  UpdateRoleDto,
  UserFiltersDto,
} from './dto';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { User, Organization, Prisma } from '@prisma/client';

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
    editor: number;
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
  constructor(private readonly prisma: PrismaService) {}

  // ==================== CREATE ====================
  /**
   * Crear el owner inicial de una organización
   * Solo llamado por organizations.service al crear org
   */
  async createOwner(
    organizationId: string,
    data: CreateOwnerDto,
  ): Promise<User> {
    // Validar que la organización existe y está activa
    await this.validateOrganization(organizationId);

    // Validar que NO existe otro owner
    await this.validateSingleOwner(organizationId);

    // Validar email único global
    await this.validateEmailUnique(data.email);

    // Hashear password
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Crear owner
    const owner = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        password: hashedPassword,
        role: 'owner',
        organizationId,
        isActive: true,
        emailVerified: false,
        emailVerificationToken: randomBytes(32).toString('hex'),
      },
    });

    return owner;
  }

  /**
   * Invitar usuario a la organización
   */
  async invite(
    organizationId: string,
    data: InviteUserDto,
    invitedBy: string,
  ): Promise<User> {
    // Validar que la organización existe y está activa
    await this.validateOrganization(organizationId);

    // Validar límite de usuarios del plan
    await this.validateUserLimit(organizationId);

    // Validar email único global
    await this.validateEmailUnique(data.email);

    // Generar password temporal (el usuario lo cambiará al aceptar)
    const temporaryPassword = randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    // Crear usuario inactivo con token de invitación
    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        password: hashedPassword,
        role: data.role || 'viewer',
        organizationId,
        isActive: false,
        emailVerified: false,
        emailVerificationToken: randomBytes(32).toString('hex'),
      },
    });

    // TODO: Enviar email de invitación (delegar a notifications service)
    // await this.notificationsService.sendInvitationEmail(user, invitedBy);

    return user;
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
  async findAll(
    organizationId: string,
    filters: UserFiltersDto,
  ): Promise<PaginatedUsers> {
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
  async findByEmail(
    email: string,
    organizationId: string,
  ): Promise<User | null> {
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
  async count(
    organizationId: string,
    filters?: { isActive?: boolean },
  ): Promise<number> {
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

    // NO se puede asignar rol 'owner' (solo existe 1 owner)
    if (newRole === 'owner') {
      throw new ForbiddenException(
        'Cannot assign owner role. Use transferOwnership instead.',
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
      throw new ForbiddenException(
        'Cannot deactivate owner. Transfer ownership first.',
      );
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
  async remove(
    userId: string,
    organizationId: string,
    actorId: string,
  ): Promise<void> {
    // Verificar que el usuario existe
    const user = await this.findOne(userId, organizationId);

    // NO se puede eliminar al owner
    await this.validateNotOwner(user);

    // Verificar que el actor tiene permisos
    const actor = await this.findOne(actorId, organizationId);
    if (actor.role !== 'owner' && actor.role !== 'admin') {
      throw new ForbiddenException(
        'Only owner or admin can delete users',
      );
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
    const [total, byRole, active, inactive, verified, unverified] =
      await Promise.all([
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
        const role = item.role as 'viewer' | 'editor' | 'admin' | 'owner';
        acc[role] = item._count;
        return acc;
      },
      { viewer: 0, editor: 0, admin: 0, owner: 0 } as {
        viewer: number;
        editor: number;
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
        OR: [
          { lastLoginAt: { lt: cutoffDate } },
          { lastLoginAt: null },
        ],
      },
      orderBy: { lastLoginAt: 'asc' },
    });
  }

  /**
   * Actividad del usuario (dentro de su org)
   */
  async getUserActivity(
    userId: string,
    organizationId: string,
  ): Promise<UserActivity> {
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
  private async validateUserLimit(organizationId: string): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { subscription: true },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    // Obtener límite del plan
    const planLimits = {
      STARTER: 3,
      GROWTH: 10,
      BUSINESS: 25,
      PRO: 50,
      ENTERPRISE: null, // Sin límite
    };

    const maxUsers = org.customMaxUsers ?? planLimits[org.plan];

    // Si es ENTERPRISE o sin límite, permitir
    if (maxUsers === null) {
      return;
    }

    // Contar usuarios activos
    const currentUserCount = await this.prisma.user.count({
      where: {
        organizationId,
        deletedAt: null,
      },
    });

    if (currentUserCount >= maxUsers) {
      throw new ForbiddenException(
        `User limit reached for ${org.plan} plan (${maxUsers} users). Upgrade your plan to add more users.`,
      );
    }
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
      owner: 4,
      admin: 3,
      editor: 2,
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
      throw new ForbiddenException(
        'Insufficient permissions to modify this user',
      );
    }
  }

  /**
   * Validar que no sea el único owner
   */
  private async validateSingleOwner(organizationId: string): Promise<void> {
    const ownerCount = await this.prisma.user.count({
      where: {
        organizationId,
        role: 'owner',
        deletedAt: null,
        isActive: true,
      },
    });

    if (ownerCount >= 1) {
      throw new ConflictException('Organization already has an owner');
    }
  }

  /**
   * Validar que NO se puede eliminar al owner
   */
  private async validateNotOwner(user: User): Promise<void> {
    if (user.role === 'owner') {
      throw new ForbiddenException(
        'Cannot delete owner. Transfer ownership first.',
      );
    }
  }

  /**
   * Validar que la organización existe y está activa
   */
  private async validateOrganization(
    organizationId: string,
  ): Promise<Organization> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    if (!org.isActive) {
      throw new ForbiddenException('Organization is not active');
    }

    if (org.deletedAt) {
      throw new ForbiddenException('Organization has been deleted');
    }

    if (org.deactivatedAt) {
      throw new ForbiddenException('Organization has been deactivated');
    }

    return org;
  }

  /**
   * Validar que el email es único (global)
   */
  private async validateEmailUnique(email: string): Promise<void> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }
  }
}
