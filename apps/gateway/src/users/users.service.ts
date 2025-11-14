import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserRole, hasPermission, Permission } from '@workflow-automation/shared-types';
import * as bcrypt from 'bcrypt';

/**
 * Servicio para gestionar usuarios dentro de organizaciones
 * 
 * Reglas:
 * - Solo Owner y Admin pueden invitar usuarios
 * - Solo Owner puede asignar roles de Owner
 * - Solo Owner puede eliminar usuarios
 * - Viewer solo puede ver
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly SALT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  /**
   * Invita un nuevo usuario a la organización
   * 
   * Validaciones:
   * - El email no debe existir en ninguna organización
   * - La organización no debe exceder su límite de usuarios
   * - Solo Owner puede crear otros Owners
   */
  async invite(
    organizationId: string,
    inviterRole: UserRole,
    dto: InviteUserDto,
  ) {
    // 1. Validar que el invitador tenga permisos
    if (!hasPermission(inviterRole, Permission.USERS_INVITE)) {
      throw new ForbiddenException('No tienes permiso para invitar usuarios');
    }

    // 2. Solo Owner puede invitar a otros Owners
    if (dto.role === UserRole.OWNER && inviterRole !== UserRole.OWNER) {
      throw new ForbiddenException('Solo el Owner puede invitar a otros Owners');
    }

    // 3. Verificar límite del plan
    const canAdd = await this.organizationsService.canAddUser(organizationId);
    if (!canAdd) {
      throw new BadRequestException(
        'Has alcanzado el límite de usuarios de tu plan. Actualiza tu plan para agregar más usuarios.',
      );
    }

    // 4. Verificar que el email no exista
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('El email ya está registrado');
    }

    // 5. Hashear contraseña
    const hashedPassword = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    // 6. Crear usuario
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: hashedPassword,
        role: dto.role,
        organizationId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    this.logger.log(
      `Usuario invitado: ${user.email} con rol ${user.role} en organización ${organizationId}`,
    );

    return user;
  }

  /**
   * Lista todos los usuarios de una organización
   */
  async findAll(organizationId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
      },
      orderBy: [
        { role: 'asc' }, // Owner primero, luego Admin, luego Viewer
        { createdAt: 'asc' },
      ],
    });

    return users;
  }

  /**
   * Obtiene un usuario específico
   */
  async findOne(userId: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  /**
   * Actualiza el rol o estado de un usuario
   * 
   * Reglas:
   * - Solo Owner puede cambiar roles
   * - No se puede cambiar el propio rol
   * - Solo Owner puede desactivar usuarios
   */
  async update(
    userId: string,
    organizationId: string,
    updaterRole: UserRole,
    updaterId: string,
    dto: UpdateUserDto,
  ) {
    // 1. Obtener el usuario a actualizar
    const user = await this.findOne(userId, organizationId);

    // 2. No permitir auto-modificación de rol
    if (userId === updaterId && dto.role) {
      throw new ForbiddenException('No puedes cambiar tu propio rol');
    }

    // 3. Validar permisos para cambiar rol
    if (dto.role && !hasPermission(updaterRole, Permission.USERS_UPDATE_ROLE)) {
      throw new ForbiddenException('No tienes permiso para cambiar roles');
    }

    // 4. Solo Owner puede crear/modificar Owners
    if (dto.role === UserRole.OWNER && updaterRole !== UserRole.OWNER) {
      throw new ForbiddenException('Solo el Owner puede asignar el rol de Owner');
    }

    // 5. Validar permisos para desactivar
    if (
      dto.isActive !== undefined &&
      !hasPermission(updaterRole, Permission.USERS_UPDATE_ROLE)
    ) {
      throw new ForbiddenException('No tienes permiso para cambiar el estado de usuarios');
    }

    // 6. Actualizar usuario
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        role: dto.role,
        isActive: dto.isActive,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    this.logger.log(`Usuario actualizado: ${updated.email}`);

    return updated;
  }

  /**
   * Elimina un usuario (soft delete)
   * 
   * Solo Owner puede eliminar usuarios
   * No se puede eliminar a sí mismo
   */
  async remove(
    userId: string,
    organizationId: string,
    deleterRole: UserRole,
    deleterId: string,
  ) {
    // 1. Validar permisos
    if (!hasPermission(deleterRole, Permission.USERS_DELETE)) {
      throw new ForbiddenException('No tienes permiso para eliminar usuarios');
    }

    // 2. No permitir auto-eliminación
    if (userId === deleterId) {
      throw new ForbiddenException('No puedes eliminarte a ti mismo');
    }

    // 3. Obtener el usuario
    const user = await this.findOne(userId, organizationId);

    // 4. Soft delete
    const deleted = await this.prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
      select: {
        id: true,
        email: true,
        name: true,
        deletedAt: true,
      },
    });

    // 5. Invalidar todos los refresh tokens del usuario
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: {
        revokedAt: new Date(),
        revokedReason: 'user_deleted',
      },
    });

    this.logger.log(`Usuario eliminado: ${deleted.email}`);

    return deleted;
  }

  /**
   * Cuenta los usuarios activos de una organización
   */
  async countActiveUsers(organizationId: string): Promise<number> {
    return this.prisma.user.count({
      where: {
        organizationId,
        isActive: true,
        deletedAt: null,
      },
    });
  }
}
