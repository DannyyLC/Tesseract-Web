import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { JwtPayload } from '../../common/types/jwt-payload.type';
import { ClientPayload } from '../../common/types/client-payload.type';

/**
 * Estrategia JWT para validar tokens de acceso
 * 
 * Flujo:
 * 1. Passport extrae el token del header Authorization: Bearer <token>
 * 2. Passport valida la firma del token con el JWT_SECRET
 * 3. Si es válido, llama a validate() con el payload decodificado
 * 4. validate() busca al cliente en la DB y valida que esté activo
 * 5. Retorna el ClientPayload que se inyecta en request.user
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
      secretOrKey: configService.get<string>('JWT_SECRET') || 'your-secret-key-change-in-production',
    });
  }

  /**
   * Valida el payload del JWT y retorna el usuario
   * Este método se ejecuta DESPUÉS de que Passport valida la firma del token
   * 
   * @param payload - Payload decodificado del JWT
   * @returns ClientPayload que se inyecta en request.user
   */
  async validate(payload: JwtPayload): Promise<ClientPayload> {
    this.logger.debug(`Validando JWT para cliente: ${payload.email}`);

    // 1. Buscar el cliente en la base de datos
    const client = await this.prisma.client.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        plan: true,
        maxWorkflows: true,
        maxExecutionsPerDay: true,
        isActive: true,
        region: true,
        metadata: true,
        deletedAt: true,
      },
    });

    // 2. Validar que el cliente existe
    if (!client) {
      this.logger.warn(`Cliente no encontrado: ${payload.sub}`);
      throw new UnauthorizedException('Cliente no encontrado');
    }

    // 3. Validar que el cliente esté activo
    if (!client.isActive) {
      this.logger.warn(`Cliente inactivo: ${client.email}`);
      throw new UnauthorizedException('Cuenta inactiva');
    }

    // 4. Validar que el cliente no esté eliminado (soft delete)
    if (client.deletedAt) {
      this.logger.warn(`Cliente eliminado: ${client.email}`);
      throw new UnauthorizedException('Cuenta eliminada');
    }

    // 5. Validar que el email coincida (seguridad adicional)
    if (client.email !== payload.email) {
      this.logger.error(
        `Email mismatch para cliente ${payload.sub}: ${client.email} vs ${payload.email}`
      );
      throw new UnauthorizedException('Token inválido');
    }

    this.logger.debug(`Cliente autenticado exitosamente: ${client.email}`);

    // 6. Retornar el payload del cliente que se inyecta en request.user
    return {
      id: client.id,
      name: client.name,
      email: client.email,
      plan: client.plan,
      maxWorkflows: client.maxWorkflows,
      maxExecutionsPerDay: client.maxExecutionsPerDay,
      isActive: client.isActive,
      region: client.region,
      metadata: client.metadata,
    };
  }
}
