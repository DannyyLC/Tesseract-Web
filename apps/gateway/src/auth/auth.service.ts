import { 
  Injectable, 
  ConflictException, 
  UnauthorizedException, 
  Logger 
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtPayload } from '../common/types/jwt-payload.type';

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
   * Registra un nuevo cliente
   * 
   * @param dto - Datos de registro (name, email, password)
   * @returns Cliente creado + tokens JWT
   */
  async register(dto: RegisterDto) {
    this.logger.log(`Registrando nuevo usuario: ${dto.email}`);

    // 1. Verificar que el email no esté registrado
    const existingClient = await this.prisma.client.findUnique({
      where: { email: dto.email },
    });

    if (existingClient) {
      throw new ConflictException('El email ya está registrado');
    }

    // 2. Hashear la contraseña
    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    // 3. Crear el cliente en la base de datos
    const client = await this.prisma.client.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: passwordHash,
        plan: 'free', // Plan por defecto
        maxWorkflows: 10,
        maxExecutionsPerDay: 100,
        maxApiKeys: 3,
        isActive: true,
        emailVerified: false, // Puedes implementar verificación de email después
      },
    });

    this.logger.log(`Usuario registrado exitosamente: ${client.email}`);

    // 4. Generar tokens JWT
    const tokens = await this.generateTokens(client.id, client.email, client.name, client.plan);

    // 5. Retornar cliente y tokens
    return {
      user: {
        id: client.id,
        name: client.name,
        email: client.email,
        plan: client.plan,
        isActive: client.isActive,
        createdAt: client.createdAt,
      },
      ...tokens,
    };
  }

  /**
   * Login de usuario existente
   * 
   * @param dto - Credenciales (email, password)
   * @returns Tokens JWT (access + refresh)
   */
  async login(dto: LoginDto) {
    this.logger.log(`Intentando login: ${dto.email}`);

    // 1. Validar credenciales
    const client = await this.validateClient(dto.email, dto.password);

    // 2. Generar tokens
    const tokens = await this.generateTokens(client.id, client.email, client.name, client.plan);

    // 3. Actualizar lastLoginAt
    await this.prisma.client.update({
      where: { id: client.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log(`Login exitoso: ${client.email}`);

    return {
      user: {
        id: client.id,
        name: client.name,
        email: client.email,
        plan: client.plan,
        isActive: client.isActive,
      },
      ...tokens,
    };
  }

  /**
   * Valida las credenciales del usuario
   * 
   * @param email - Email del usuario
   * @param password - Password en texto plano
   * @returns Cliente si las credenciales son válidas
   * @throws UnauthorizedException si las credenciales son inválidas
   */
  async validateClient(email: string, password: string) {
    // 1. Buscar cliente por email
    const client = await this.prisma.client.findUnique({
      where: { email },
    });

    if (!client) {
      this.logger.warn(`Cliente no encontrado: ${email}`);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // 2. Verificar que tenga contraseña (puede no tener si usa OAuth)
    if (!client.password) {
      this.logger.warn(`Cliente sin contraseña: ${email}`);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // 3. Comparar contraseña con bcrypt
    const isPasswordValid = await bcrypt.compare(password, client.password);
    if (!isPasswordValid) {
      this.logger.warn(`Contraseña inválida para: ${email}`);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // 4. Verificar que el cliente esté activo
    if (!client.isActive) {
      this.logger.warn(`Cliente inactivo: ${email}`);
      throw new UnauthorizedException('Cuenta inactiva');
    }

    // 5. Verificar que no esté eliminado
    if (client.deletedAt) {
      this.logger.warn(`Cliente eliminado: ${email}`);
      throw new UnauthorizedException('Cuenta eliminada');
    }

    return client;
  }

  /**
   * Genera access token y refresh token
   * 
   * @param clientId - ID del cliente
   * @param email - Email del cliente
   * @param name - Nombre del cliente
   * @param plan - Plan del cliente
   * @returns Access token y refresh token
   */
  async generateTokens(clientId: string, email: string, name: string, plan: string) {
    // 1. Crear payload para el JWT
    const payload: JwtPayload = {
      sub: clientId,
      email,
      name,
      plan,
    };

    // 2. Generar access token (corta duración)
    const accessToken = this.jwtService.sign(payload);

    // 3. Generar refresh token (larga duración)
    const refreshTokenExpiry = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d';
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET') || 'refresh-secret-change-in-production',
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
        clientId,
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
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET') || 'refresh-secret-change-in-production',
      });

      // 2. Buscar refresh tokens en la DB que coincidan
      const storedTokens = await this.prisma.refreshToken.findMany({
        where: {
          clientId: payload.sub,
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
        this.logger.warn(`Refresh token no encontrado para cliente: ${payload.sub}`);
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
      const payload = this.jwtService.decode(refreshToken) as JwtPayload;
      
      if (!payload) {
        throw new UnauthorizedException('Token inválido');
      }

      // 2. Buscar todos los refresh tokens del cliente
      const storedTokens = await this.prisma.refreshToken.findMany({
        where: {
          clientId: payload.sub,
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
   * Invalida todos los refresh tokens de un cliente
   * Útil para "cerrar sesión en todos los dispositivos"
   * 
   * @param clientId - ID del cliente
   */
  async logoutAll(clientId: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        clientId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedReason: 'logout_all',
      },
    });

    this.logger.log(`Todas las sesiones cerradas para cliente: ${clientId}`);
    return { message: 'Sesión cerrada en todos los dispositivos' };
  }

  /**
   * Crea un nuevo usuario (solo para admins)
   * Permite especificar plan y límites personalizados
   * 
   * @param dto - Datos del usuario a crear
   * @throws ConflictException si el email ya existe
   */
  async createUser(dto: CreateUserDto) {
    // Verificar que el email no exista
    const existingClient = await this.prisma.client.findUnique({
      where: { email: dto.email },
    });

    if (existingClient) {
      throw new ConflictException('El email ya está registrado');
    }

    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Determinar límites según el plan
    const plan = dto.plan || 'free';
    const defaultLimits: Record<string, { maxWorkflows: number; maxExecutionsPerDay: number; maxApiKeys: number }> = {
      free: { maxWorkflows: 5, maxExecutionsPerDay: 100, maxApiKeys: 2 },
      pro: { maxWorkflows: 50, maxExecutionsPerDay: 10000, maxApiKeys: 10 },
      enterprise: { maxWorkflows: -1, maxExecutionsPerDay: -1, maxApiKeys: -1 },
      admin: { maxWorkflows: -1, maxExecutionsPerDay: -1, maxApiKeys: -1 },
    };

    const limits = defaultLimits[plan];

    // Crear el cliente
    const client = await this.prisma.client.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hashedPassword,
        plan,
        maxWorkflows: dto.maxWorkflows ?? limits.maxWorkflows,
        maxExecutionsPerDay: dto.maxExecutionsPerDay ?? limits.maxExecutionsPerDay,
        maxApiKeys: dto.maxApiKeys ?? limits.maxApiKeys,
      },
    });

    this.logger.log(`Usuario creado por admin: ${client.email} (plan: ${plan})`);

    // Retornar sin el hash de contraseña
    const { password, ...clientWithoutPassword } = client;
    return clientWithoutPassword;
  }

  /**
   * Lista todos los usuarios del sistema
   * Solo disponible para administradores
   * 
   * @param includeDeleted - Si se deben incluir usuarios eliminados
   * @returns Lista de usuarios sin contraseñas
   */
  async listUsers(includeDeleted: boolean = false) {
    const users = await this.prisma.client.findMany({
      where: includeDeleted ? {} : { deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        plan: true,
        maxWorkflows: true,
        maxExecutionsPerDay: true,
        maxApiKeys: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        lastLoginAt: true,
        region: true,
        _count: {
          select: {
            workflows: true,
            apiKeys: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    this.logger.log(`Listando ${users.length} usuarios`);
    return users;
  }

  /**
   * Elimina un usuario (soft delete)
   * Solo disponible para administradores
   * 
   * @param userId - ID del usuario a eliminar
   * @throws NotFoundException si el usuario no existe
   */
  async deleteUser(userId: string) {
    const user = await this.prisma.client.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    if (user.deletedAt) {
      throw new ConflictException('El usuario ya está eliminado');
    }

    // Soft delete
    const deletedUser = await this.prisma.client.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        deletedAt: true,
      },
    });

    // Invalidar todos los refresh tokens del usuario
    await this.prisma.refreshToken.updateMany({
      where: { clientId: userId },
      data: {
        revokedAt: new Date(),
        revokedReason: 'user_deleted',
      },
    });

    this.logger.log(`Usuario eliminado: ${deletedUser.email}`);
    return deletedUser;
  }
}
