import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { UserPayload } from '../../common/types/user-payload.type';

/**
 * Estrategia JWT para validar tokens de acceso del sistema multi-tenant
 *
 * Flujo:
 * 1. Passport extrae el token del header Authorization: Bearer <token>
 * 2. Passport valida la firma del token con el JWT_SECRET
 * 3. Si es válido, llama a validate() con el payload decodificado
 * 4. validate() busca al usuario en la DB y valida que esté activo
 * 5. Retorna el UserPayload que se inyecta en request.user
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      // Extraer el JWT del header Authorization: Bearer <token>
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      // NO ignorar tokens expirados
      ignoreExpiration: false,

      // Secret key para validar la firma del token
      secretOrKey:
        configService.get<string>('JWT_SECRET') ?? 'your-secret-key-change-in-production',
    });
  }

  /**
   * Valida el payload del JWT y retorna el usuario
   * Este método se ejecuta DESPUÉS de que Passport valida la firma del token
   *
   * @param payload - Payload decodificado del JWT
   * @returns UserPayload que se inyecta en request.user
   */
  async validate(payload: UserPayload): Promise<UserPayload> {
    this.logger.debug(`Validando JWT para usuario: ${payload.email}`);

    // 1. Buscar el usuario en la base de datos con su organización
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { organization: true },
    });

    // 2. Validar que el usuario existe
    if (!user) {
      this.logger.warn(`Usuario no encontrado: ${payload.sub}`);
      throw new UnauthorizedException('Usuario no encontrado');
    }

    // 3. Validar que tenga organización
    if (!user.organization) {
      this.logger.warn(`Usuario sin organización: ${payload.sub}`);
      throw new UnauthorizedException('Usuario sin organización');
    }

    // 4. Validar que el usuario esté activo
    if (!user.isActive) {
      this.logger.warn(`Usuario inactivo: ${user.email}`);
      throw new UnauthorizedException('Cuenta inactiva');
    }

    // 5. Validar que el usuario no esté eliminado (soft delete)
    if (user.deletedAt) {
      this.logger.warn(`Usuario eliminado: ${user.email}`);
      throw new UnauthorizedException('Cuenta eliminada');
    }

    // 6. Validar que la organización esté activa
    if (!user.organization.isActive) {
      this.logger.warn(`Organización inactiva: ${user.organization.name}`);
      throw new UnauthorizedException('Organización inactiva');
    }

    // 7. Validar que el email coincida (seguridad adicional)
    if (user.email !== payload.email) {
      this.logger.error(
        `Email mismatch para usuario ${payload.sub}: ${user.email} vs ${payload.email}`,
      );
      throw new UnauthorizedException('Token inválido');
    }

    this.logger.debug(
      `Usuario autenticado exitosamente: ${user.email} (${user.organization.name})`,
    );

    // 8. Retornar el payload completo que se inyecta en request.user
    return {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organization.id,
      organizationName: user.organization.name,
      plan: user.organization.plan,
    };
  }
}
