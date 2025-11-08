import { 
  Injectable, 
  CanActivate, 
  ExecutionContext, 
  ForbiddenException,
  UnauthorizedException,
  Logger 
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * AdminGuard - Protección multi-capa para endpoints de administración
 * 
 * Validaciones:
 * 1. JWT válido (validado por JwtAuthGuard antes)
 * 2. Usuario tiene plan "admin" en la DB
 * 3. Header X-Admin-Key coincide con ADMIN_API_KEY del .env
 * 
 * Uso:
 * @UseGuards(JwtAuthGuard, AdminGuard)
 * 
 * Headers requeridos:
 *   Authorization: Bearer <JWT>
 *   X-Admin-Key: <ADMIN_API_KEY>
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // 1. Validar que el usuario esté autenticado (JWT)
    const user = request.user;
    if (!user) {
      this.logger.warn('Intento de acceso admin sin JWT');
      throw new UnauthorizedException('Autenticación requerida');
    }

    // 2. Validar que el usuario sea administrador
    if (user.plan !== 'admin') {
      this.logger.warn(`Intento de acceso admin por usuario no admin: ${user.email}`);
      throw new ForbiddenException('Requiere permisos de administrador');
    }

    // 3. Validar X-Admin-Key header
    const adminKey = request.headers['x-admin-key'];
    const expectedAdminKey = this.configService.get<string>('ADMIN_API_KEY');

    // DEBUG: Log temporal para verificar
    this.logger.debug(`Admin Key recibida: ${adminKey ? 'SÍ' : 'NO'}`);
    this.logger.debug(`Admin Key esperada: ${expectedAdminKey ? 'SÍ' : 'NO'}`);

    if (!adminKey) {
      this.logger.warn(`Intento de acceso admin sin X-Admin-Key: ${user.email}`);
      throw new ForbiddenException('X-Admin-Key header requerido');
    }

    if (!expectedAdminKey) {
      this.logger.error('ADMIN_API_KEY no configurada en variables de entorno');
      throw new ForbiddenException('Configuración de admin incompleta');
    }

    if (adminKey !== expectedAdminKey) {
      this.logger.error(`X-Admin-Key inválida para usuario: ${user.email} desde IP: ${request.ip}`);
      throw new ForbiddenException('X-Admin-Key inválida');
    }

    // Log de acceso exitoso
    this.logger.log(`Acceso admin autorizado: ${user.email}`);

    return true;
  }
}
