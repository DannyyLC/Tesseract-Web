import { 
  Injectable, 
  ConflictException, 
  UnauthorizedException, 
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UserPayload } from '../common/types/user-payload.type';
import { PlanType } from '@workflow-automation/shared-types';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';

/**
 * AuthService maneja toda la lógica de autenticación JWT
 * 
 * Funcionalidades:
 * - Registro de nuevos usuarios
 * - Login y generación de tokens
 * - Validación de credenciales
 * - Refresh de tokens
 * - Logout e invalidación de tokens
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Registra una nueva organización con su usuario Owner
   *
   * @param dto - Datos de registro (name, email, password)
   * @returns Organization + User Owner + tokens JWT
   */
  async register(dto: RegisterDto) {
    this.logger.log(`Registrando nueva organización: ${dto.email}`);

    // 1. Verificar que el email no esté registrado
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('El email ya está registrado');
    }

    // 2. Hashear la contraseña
    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    // 3. Generar slug único para la organización
    const baseSlug = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    let slug = baseSlug;
    let counter = 1;
    while (await this.prisma.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // 4. Crear Organization + User Owner en una transacción
    const result = await this.prisma.$transaction(async (tx: any) => {
      // Crear la organización
      const organization = await tx.organization.create({
        data: {
          name: dto.name,
          slug,
          plan: PlanType.FREE,
          maxUsers: 3,
          maxWorkflows: 5,
          maxExecutionsPerDay: 100,
          maxApiKeys: 2,
          isActive: true,
        },
      });

      // Crear el usuario Owner
      const user = await tx.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          password: passwordHash,
          role: 'owner',
          organizationId: organization.id,
          isActive: true,
          emailVerified: false,
        },
      });

      return { organization, user };
    });

    this.logger.log(
      `Organización y usuario owner creados: ${result.organization.slug} - ${result.user.email}`,
    );

    // 5. Generar tokens JWT
    const tokens = await this.generateTokens(
      result.user.id,
      result.user.email,
      result.user.name,
      result.user.role,
      result.organization.id,
      result.organization.name,
      result.organization.plan,
    );

    // 6. Retornar datos
    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
      },
      organization: {
        id: result.organization.id,
        name: result.organization.name,
        slug: result.organization.slug,
        plan: result.organization.plan,
      },
      ...tokens,
    };
  }

  /**
   * Login de usuario existente
   *
   * @param dto - Credenciales (email, password)
   * @returns qrCode, tempToken
   */
  async login(dto: LoginDto) {
    this.logger.log(`Intentando login: ${dto.email}`);

    // 1. Validar credenciales y obtener usuario con organización
    const { user, organization } = await this.validateUser(
      dto.email,
      dto.password,
    );
    const payload: UserPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: organization.id,
      organizationName: organization.name,
      plan: organization.plan,
    };
    // 2. Generar temporary token
    const tempToken = this.jwtService.sign(payload, {
      secret:
        this.configService.get<string>('TEMP_TOKEN_SECRET') ||
        'temp-token-secret',
      expiresIn: '15m',
    });
    return {
      ...(user.twoFactorEnabled ? {qr: "not needed"} : await this.setup2FA(user.id)),
      tempToken,
    };
  }

  /**
   * Valida las credenciales del usuario
   *
   * @param email - Email del usuario
   * @param password - Password en texto plano
   * @returns User + Organization si las credenciales son válidas
   * @throws UnauthorizedException si las credenciales son inválidas
   */
  async validateUser(email: string, password: string) {
    // 1. Buscar usuario por email con su organización
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });

    if (!user) {
      this.logger.warn(`Usuario no encontrado: ${email}`);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // 2. Verificar que tenga organización
    if (!user.organization) {
      this.logger.warn(`Usuario sin organización: ${email}`);
      throw new UnauthorizedException('Usuario sin organización asignada');
    }

    // 3. Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      this.logger.warn(`Contraseña inválida para: ${email}`);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // 4. Verificar que el usuario esté activo
    if (!user.isActive) {
      this.logger.warn(`Usuario inactivo: ${email}`);
      throw new UnauthorizedException('Cuenta inactiva');
    }

    // 5. Verificar que no esté eliminado
    if (user.deletedAt) {
      this.logger.warn(`Usuario eliminado: ${email}`);
      throw new UnauthorizedException('Cuenta eliminada');
    }

    // 6. Verificar que la organización esté activa
    if (!user.organization.isActive) {
      this.logger.warn(`Organización inactiva: ${user.organization.name}`);
      throw new UnauthorizedException('Organización inactiva');
    }

    return { user, organization: user.organization };
  }

  /**
   * Genera access token y refresh token
   *
   * @param userId - ID del usuario
   * @param email - Email del usuario
   * @param name - Nombre del usuario
   * @param role - Rol del usuario
   * @param organizationId - ID de la organización
   * @param organizationName - Nombre de la organización
   * @param plan - Plan de la organización
   * @returns Access token y refresh token
   */
  async generateTokens(
    userId: string,
    email: string,
    name: string,
    role: string,
    organizationId: string,
    organizationName: string,
    plan: string,
  ) {
    // 1. Crear payload para el JWT
    const payload: UserPayload = {
      sub: userId,
      email,
      name,
      role,
      organizationId,
      organizationName,
      plan,
    };

    // 2. Generar access token (corta duración)
    const accessToken = this.jwtService.sign(payload, {
      secret:
        this.configService.get<string>('JWT_SECRET') ||
        'super-secret-change-in-production',
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN') || '1d',
    });

    // 3. Generar refresh token (larga duración)
    const refreshTokenExpiry =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d';
    const refreshToken = this.jwtService.sign(payload, {
      secret:
        this.configService.get<string>('JWT_REFRESH_SECRET') ||
        'refresh-secret-change-in-production',
      expiresIn: refreshTokenExpiry as any,
    });

    // 4. Generar hash del refresh token
    const refreshTokenHash = await bcrypt.hash(refreshToken, this.SALT_ROUNDS);

    // 5. Generar familyId para token rotation
    const familyId = crypto.randomUUID();

    // 6. Guardar refresh token en la base de datos
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: refreshTokenHash,
        familyId,
        userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * Refresca el access token usando un refresh token válido
   *
   * @param refreshToken - Refresh token en texto plano
   * @returns Nuevos access token y refresh token
   */
  async refreshTokens(refreshToken: string) {
    try {
      // 1. Verificar y decodificar el refresh token
      const payload = this.jwtService.verify<UserPayload>(refreshToken, {
        secret:
          this.configService.get<string>('JWT_REFRESH_SECRET') ||
          'refresh-secret-change-in-production',
      });

      // 2. Buscar refresh tokens en la DB que coincidan
      const storedTokens = await this.prisma.refreshToken.findMany({
        where: {
          userId: payload.sub,
          revokedAt: null,
          expiresAt: { gte: new Date() },
        },
      });

      if (storedTokens.length === 0) {
        throw new UnauthorizedException('Refresh token inválido o expirado');
      }

      // 3. Comparar el refresh token con los hashes almacenados
      let matchedToken = null;
      for (const stored of storedTokens) {
        const isMatch = await bcrypt.compare(refreshToken, stored.tokenHash);
        if (isMatch) {
          matchedToken = stored;
          break;
        }
      }

      if (!matchedToken) {
        this.logger.warn(
          `Refresh token no encontrado para usuario: ${payload.sub}`,
        );
        throw new UnauthorizedException('Refresh token inválido');
      }

      // 4. Revocar el refresh token usado (token rotation)
      await this.prisma.refreshToken.update({
        where: { id: matchedToken.id },
        data: {
          revokedAt: new Date(),
          revokedReason: 'token_rotated',
        },
      });

      // 5. Generar nuevos tokens
      const tokens = await this.generateTokens(
        payload.sub,
        payload.email,
        payload.name,
        payload.role,
        payload.organizationId,
        payload.organizationName,
        payload.plan,
      );

      this.logger.log(`Tokens refrescados para: ${payload.email}`);

      return tokens;
    } catch (error) {
      this.logger.error('Error al refrescar tokens', error);
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }
  }

  /**
   * Cierra sesión del usuario invalidando su refresh token
   *
   * @param refreshToken - Refresh token a invalidar
   */
  async logout(refreshToken: string) {
    try {
      // 1. Decodificar el token (sin verificar expiración para permitir logout de tokens expirados)
      const payload = this.jwtService.decode(refreshToken) as UserPayload;

      if (!payload) {
        throw new UnauthorizedException('Token inválido');
      }

      // 2. Buscar todos los refresh tokens del usuario
      const storedTokens = await this.prisma.refreshToken.findMany({
        where: {
          userId: payload.sub,
          revokedAt: null,
        },
      });

      // 3. Encontrar y revocar el token específico
      for (const stored of storedTokens) {
        const isMatch = await bcrypt.compare(refreshToken, stored.tokenHash);
        if (isMatch) {
          await this.prisma.refreshToken.update({
            where: { id: stored.id },
            data: {
              revokedAt: new Date(),
              revokedReason: 'logout',
            },
          });

          this.logger.log(`Sesión cerrada para: ${payload.email}`);
          return { message: 'Sesión cerrada exitosamente' };
        }
      }

      return { message: 'Token no encontrado' };
    } catch (error) {
      this.logger.error('Error al cerrar sesión', error);
      throw new UnauthorizedException('Error al cerrar sesión');
    }
  }

  /**
   * Invalida todos los refresh tokens de un usuario
   * Útil para "cerrar sesión en todos los dispositivos"
   *
   * @param userId - ID del usuario
   */
  async logoutAll(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedReason: 'logout_all',
      },
    });

    this.logger.log(`Todas las sesiones cerradas para usuario: ${userId}`);
    return { message: 'Sesión cerrada en todos los dispositivos' };
  }

  // ========================================================================
  // MÉTODOS DE ADMINISTRACIÓN - TODO: Mover a UsersService y OrganizationsService
  // ========================================================================

  // Estos métodos usan el modelo Client antiguo y deben ser refactorizados
  // para trabajar con User y Organization por separado.
  // Se comentan temporalmente para evitar errores de compilación.

  /*
  async createUser(dto: CreateUserDto) {
    // TODO: Implementar en UsersService
    // Debe crear un usuario dentro de una organización existente
    // y validar límites del plan de la organización
  }

  async listUsers(includeDeleted: boolean = false, status?: 'active' | 'inactive' | 'all') {
    // TODO: Implementar en UsersService
    // Debe listar usuarios de una organización específica
  }

  async findUserById(userId: string) {
    // TODO: Implementar en UsersService
  }

  async updateUser(userId: string, updateData: any) {
    // TODO: Implementar en UsersService
  }

  async deleteUser(userId: string) {
    // TODO: Implementar en UsersService
  }
  */

  async generateTempToken(dto: LoginDto, expiresIn: string = '15m') {
    // 1. Validar credenciales y obtener usuario con organización
    const { user, organization } = await this.validateUser(
      dto.email,
      dto.password,
    );
    const payload: UserPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: organization.id,
      organizationName: organization.name,
      plan: organization.plan,
    };
    // 2. Generar temporary token
    const tempToken = this.jwtService.sign(payload, {
      secret:
        this.configService.get<string>('TEMP_TOKEN_SECRET') ||
        'temp-token-secret',
      expiresIn,
    });
    return tempToken;
  }

  async setup2FA(userId: string) {
    //Now we are wrapping the userId in a text, optionally we could add a complex secret here
    const secret = speakeasy.generateSecret({ name: `Tesseract (${userId})` });
    // Guarda secret.base32 en user.twoFactorSecret y twoFactorEnabled=false
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret.base32, twoFactorEnabled: false },
    });
    const qr = await qrcode.toDataURL(secret.otpauth_url);
    return { qr };
  }

  async verify2FACode(userPayload: UserPayload, authCode: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userPayload.sub },
    });
    const organization = await this.prisma.organization.findUnique({
      where: { id: userPayload.organizationId },
    });
    if (!user?.twoFactorSecret) return null;
    if (!organization) return null;
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: authCode,
    });
    if (verified) {
      await this.prisma.user.update({
        where: { id: userPayload.sub },
        data: { twoFactorEnabled: true },
      });

      // 2. Generar tokens
      const tokens = await this.generateTokens(
        userPayload.sub,
        userPayload.email,
        userPayload.name,
        userPayload.role,
        userPayload.organizationId,
        userPayload.organizationName,
        userPayload.plan,
      );

      // 3. Actualizar lastLoginAt
      await this.prisma.user.update({
        where: { id: userPayload.sub },
        data: { lastLoginAt: new Date() },
      });

      this.logger.log(
        `Login exitoso: ${userPayload.email} (${userPayload.organizationName})`,
      );
      return {
        user: {
          id: userPayload.sub,
          email: userPayload.email,
          name: userPayload.name,
          role: userPayload.role,
        },
        organization: {
          id: userPayload.organizationId,
          name: userPayload.organizationName,
          slug: organization.slug,
          plan: userPayload.plan,
        },
        ...tokens,
      };
    } else {
      return null;
    }
  }
}
