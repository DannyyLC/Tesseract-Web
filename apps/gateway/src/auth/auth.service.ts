import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SubscriptionPlan } from '@workflow-automation/shared-types';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import * as nodemailer from 'nodemailer';
import * as qrcode from 'qrcode';
import * as speakeasy from 'speakeasy';
import { Logger } from 'winston';
import { UserPayload } from '../common/types/user-payload.type';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../notifications/email/email.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateUserDto } from '../users/dto';
import { StepOneErrors, StepThreeErrors } from './dto/error-singup-codes.dto';
import { LoginDto } from './dto/login.dto';
import { StartVerificationFlowDto } from './dto/start-verification-flow.dto';
import { VerificationCodeDto } from './dto/verification-code.dto';
import { UtilityService } from '../utility/utility.service';

/**
 * AuthService maneja toda la lógica de autenticación JWT
 */
@Injectable()
export class AuthService {
  static readonly SALT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly emailService: EmailService,
    private readonly utilityService: UtilityService,
  ) {}

  //==============================================================
  // AUTHENTICATION METHODS
  //==============================================================
  /**
   * Login de usuario existente
   *
   * @param dto - Credenciales (email, password)
   * @returns qrCode, tempToken
   */
  async login(dto: LoginDto) {
    this.logger.info(`Intentando login: ${dto.email}`);

    // 1. Validar credenciales y obtener usuario con organización
    const { user, organization } = await this.validateUser(dto.email, dto.password);
    console.log(user, organization);
    const payload: UserPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: organization.id,
      organizationName: organization.name,
      plan: organization.plan,
      rememberMe: dto.rememberMe,
    };
    // 2. Si 2FA no está habilitado, login directo
    if (!user.twoFactorEnabled) {
      // Generar tokens finales
      console.log('Generating tokens without 2FA');
      const tokens = await this.generateTokens(
        user.id,
        user.email,
        user.name,
        user.role,
        organization.id,
        organization.name,
        organization.plan,
        dto.rememberMe,
      );
      console.log('Tokens generated:', tokens);
      // Actualizar lastLoginAt
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      this.logger.info(`Login directo exitoso: ${user.email}`);
      return {
        status: 'complete',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          organizationId: organization.id,
        },
        ...tokens,
      };
    }

    // 3. Si 2FA está habilitado, flujo intermedio
    const tempToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('TEMP_TOKEN_SECRET') ?? 'temp-token-secret',
      expiresIn: '15m',
    });

    return {
      status: '2fa_required',
      tempToken,
    };
  }

  /**
   * Cierra sesión del usuario invalidando su refresh token
   *
   * @param refreshToken - Refresh token a invalidar
   */
  async logout(refreshToken: string) {
    try {
      // 1. Decodificar el token (sin verificar expiración para permitir logout de tokens expirados)
      const payload = this.jwtService.decode(refreshToken);

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

          this.logger.info(`Sesión cerrada para: ${payload.email}`);
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

    this.logger.info(`Todas las sesiones cerradas para usuario: ${userId}`);
    return { message: 'Sesión cerrada en todos los dispositivos' };
  }

  //==============================================================
  // VALIDATIONS
  //==============================================================
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
   * Validar que el email es único (global)
   */

  //==============================================================
  // TOKENS
  //==============================================================
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
    rememberMe?: boolean,
    prismaClient?: any, // Optional transaction client
  ) {
    const prisma = prismaClient || this.prisma;
    // 1. Crear payload para el JWT
    const payload: UserPayload = {
      sub: userId,
      email,
      name,
      role,
      organizationId,
      organizationName,
      plan,
      rememberMe,
    };

    // 2. Generar access token (corta duración)
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET') ?? 'super-secret-change-in-production',
      expiresIn: this.configService.get('JWT_EXPIRES_IN') ?? '1d',
    });

    // 3. Generar refresh token (larga duración)
    const refreshExpiresIn = rememberMe
      ? '30d'
      : (this.configService.get('JWT_REFRESH_EXPIRES_IN') ?? '7d');
    const refreshToken = this.jwtService.sign(payload, {
      secret:
        this.configService.get<string>('JWT_REFRESH_SECRET') ??
        'refresh-secret-change-in-production',
      expiresIn: refreshExpiresIn,
    });

    // 4. Generar hash del refresh token
    const refreshTokenHash = await this.utilityService.hashPassword(refreshToken);

    // 5. Generar familyId para token rotation
    const familyId = crypto.randomUUID();

    // 6. Guardar refresh token en la base de datos
    const expiresAtDate = new Date();
    expiresAtDate.setDate(expiresAtDate.getDate() + (rememberMe ? 30 : 7));

    await prisma.refreshToken.create({
      data: {
        tokenHash: refreshTokenHash,
        familyId,
        userId,
        expiresAt: expiresAtDate,
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
          this.configService.get<string>('JWT_REFRESH_SECRET') ??
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
        this.logger.warn(`Refresh token no encontrado para usuario: ${payload.sub}`);
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
        payload.rememberMe,
      );

      this.logger.info(`Tokens refrescados para: ${payload.email}`);

      return {
        ...tokens,
        rememberMe: payload.rememberMe,
      };
    } catch (error) {
      this.logger.error('Error al refrescar tokens', error);
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }
  }
  // ==================== VERIFICATION TOKEN UTILITIES ====================
  /**
   * Genera un token de verificación aleatorio
   *
   * @returns Token hexadecimal de 32 bytes (64 caracteres)
   */
  generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Genera un token de verificación con fecha de expiración
   *
   * @param expiresInHours - Horas hasta que expire el token (default: 24)
   * @returns Objeto con token y fecha de expiración
   */
  generateTokenWithExpiry(expiresInHours = 24): {
    token: string;
    expiresAt: Date;
  } {
    const token = this.generateVerificationToken();
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    return { token, expiresAt };
  }

  /**
   * Valida si un token de verificación ha expirado
   *
   * @param expiresAt - Fecha de expiración del token
   * @returns true si ha expirado, false si aún es válido
   */
  isTokenExpired(expiresAt: Date | null): boolean {
    if (!expiresAt) return true;
    return expiresAt < new Date();
  }

  /**
   * Regenerar token de verificación cuando ha expirado
   * Se puede usar por email o userId
   *
   * @param emailOrUserId - Email o ID del usuario
   * @param organizationId - ID de la organización (opcional)
   * @returns Token generado y fecha de expiración
   */
  async regenerateVerificationToken(
    emailOrUserId: string,
    organizationId?: string,
  ): Promise<{ message: string; token: string; expiresAt: Date }> {
    // Buscar usuario por email o ID
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: emailOrUserId }, { id: emailOrUserId }],
        ...(organizationId && { organizationId }),
        deletedAt: null,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Validar que el email NO esté verificado
    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Generar nuevo token y expiración
    const { token: newToken, expiresAt } = this.generateTokenWithExpiry(24);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: newToken,
        emailVerificationTokenExpires: expiresAt,
      },
    });

    // TODO: Enviar email con nuevo token
    // await this.notificationsService.sendVerificationEmail(user.email, newToken);

    return {
      message: 'Verification token regenerated successfully',
      token: newToken,
      expiresAt,
    };
  }

  //==============================================================
  // TOKENS
  //==============================================================
  async setup2FA(userId: string) {
    //Now we are wrapping the userId in a text, optionally we could add a complex secret here
    const secret = speakeasy.generateSecret({ name: `Tesseract (${userId})` });
    // Guarda secret.base32 en user.twoFactorSecret y twoFactorEnabled=false
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret.base32, twoFactorEnabled: false },
    });
    const qr = await qrcode.toDataURL(secret.otpauth_url ?? '');
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
        userPayload.rememberMe,
      );

      // 3. Actualizar lastLoginAt
      await this.prisma.user.update({
        where: { id: userPayload.sub },
        data: { lastLoginAt: new Date() },
      });

      this.logger.info(`Login exitoso: ${userPayload.email} (${userPayload.organizationName})`);
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
        rememberMe: userPayload.rememberMe,
      };
    } else {
      return null;
    }
  }

  async signupStepOne(
    payload: StartVerificationFlowDto,
  ): Promise<nodemailer.SentMessageInfo | keyof typeof StepOneErrors> {
    const emailExists = await this.prisma.user.findUnique({
      where: { email: payload.email },
    });

    if (emailExists) {
      return StepOneErrors.EMAIL_ALREADY_EXISTS;
    }

    const isVerificationInProgress = await this.prisma.userVerification.findFirst({
      where: {
        email: payload.email,
        expiresAt: { gt: new Date() },
      },
    });

    if (isVerificationInProgress) {
      return StepOneErrors.ALREADY_IN_PROGRESS;
    } else {
      try {
        await this.prisma.userVerification.deleteMany({
          where: {
            email: payload.email,
          },
        });
      } catch (error) {
        this.logger.error(
          `signupStepOne >> Error eliminando filas de verificación antiguas para email ${payload.email}: ${error}`,
        );
        return StepOneErrors.SERVER_INTERNAL_ERROR;
      }
    }

    const { sentMessageInfo, verificationCode } =
      await this.emailService.sendVerificationCodeByEmail(payload);

    if (!sentMessageInfo || sentMessageInfo.success === false) {
      this.logger.error(`authService >> signupStepOne >> Email no aceptado para ${payload.email}`);
      return StepOneErrors.TRANSPORTER_ERROR;
    }

    try {
      const verificationCodeRow = await this.prisma.userVerification.create({
        data: {
          email: payload.email,
          organizationName: payload.organizationName,
          userName: payload.userName,
          verificationCode: verificationCode,
          isEmailVerified: false,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000), // Expira en 15 minutos
        },
      });
      if (!verificationCodeRow) {
        this.logger.error(
          `signupStepOne >> Error creando fila de verificación para email ${payload.email}`,
        );
        return StepOneErrors.SERVER_INTERNAL_ERROR;
      }
    } catch (error) {
      this.logger.error(
        `signupStepOne >> Error creando fila de verificación para email ${payload.email}: ${error}`,
      );
      return StepOneErrors.SERVER_INTERNAL_ERROR;
    }

    return sentMessageInfo;
  }

  async signupStepTwo(data: VerificationCodeDto): Promise<boolean> {
    const userVerificationRow = await this.prisma.userVerification.findFirst({
      where: {
        email: data.email,
        verificationCode: data.verificationCode,
        expiresAt: { gt: new Date() },
      },
    });
    if (!userVerificationRow) {
      return false;
    }
    const isUpdated = await this.prisma.userVerification.updateMany({
      where: { email: data.email },
      data: { isEmailVerified: true },
    });
    if (isUpdated.count === 0) {
      this.logger.error(
        `AuthService >>  SignupStep2 -> Error actualizando el estado de verificación para email ${data.email}`,
      );
      return false;
    }
    return true;
  }

  /**
   * Crear usuario
   */
  async signupStepThree(user: CreateUserDto): Promise<any | keyof typeof StepThreeErrors> {
    const userVerificationRow = await this.prisma.userVerification.findFirst({
      where: {
        email: user.email,
        isEmailVerified: true,
      },
    });
    let createdResult: any = null;
    // Hashear password
    const hashedPassword = await this.utilityService.hashPassword(user.password);
    if (userVerificationRow) {
      try {
        // Iniciar transacción para asegurar atomicidad
        // Iniciar transacción para asegurar atomicidad
        createdResult = await this.prisma.$transaction(async (tx) => {
          // 1. Crear Organización
          const slug = await OrganizationsService.generateUniqueSlug(
            userVerificationRow.organizationName,
            tx,
          );

          const newOrganization = await tx.organization.create({
            data: {
              name: userVerificationRow.organizationName,
              slug: slug,
              plan: SubscriptionPlan.FREE,
              isActive: true, 
              allowOverages: false, 
            },
          });

          // Crear balance inicial (siempre necesario al crear org)
          await tx.creditBalance.create({
            data: {
              organizationId: newOrganization.id,
              balance: 0,
              lifetimeEarned: 0,
              lifetimeSpent: 0,
              currentMonthSpent: 0,
              currentMonthCostUSD: 0,
            },
          });

          // 2. Crear Usuario
          const newUser = await tx.user.create({
            data: {
              email: userVerificationRow.email,
              name: userVerificationRow.userName,
              password: hashedPassword,
              role: 'owner', 
              organizationId: newOrganization.id,
              isActive: true,
              emailVerified: userVerificationRow.isEmailVerified,
            },
          });

          // 3. Borrar verificación
          await tx.userVerification.deleteMany({
            where: { email: user.email },
          });

          // 4. Generate Tokens
          const tokens = await this.generateTokens(
            newUser.id,
            newUser.email,
            newUser.name,
            newUser.role,
            newOrganization.id,
            newOrganization.name,
            newOrganization.plan,
            false, // rememberMe default false
            tx // Pass transaction client
          );

          // 5. Update lastLogin
          await tx.user.update({
            where: { id: newUser.id },
            data: { lastLoginAt: new Date() },
          });

          return {
            user: newUser,
            ...tokens,
            rememberMe: false,
          };
        });
      } catch (error) {
        this.logger.error(
          `AuthService -> signupStep3 method >> Error en transacción de creación: ${error}`,
        );
        return StepThreeErrors.SERVER_INTERNAL_ERROR;
      }
    } else {
      this.logger.error(
        `AuthService -> signupStep3 method >> No se encontró verificación de email para el usuario ${user.email}`,
      );
      return StepThreeErrors.EMAIL_NOT_VERIFIED;
    }

    return createdResult;
  }
}
