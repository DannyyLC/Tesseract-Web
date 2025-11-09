import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@workflow-automation/shared-types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserPayload } from '../../common/types/jwt-payload.type';

/**
 * Guard que verifica si el usuario tiene el rol requerido
 * 
 * Flujo:
 * 1. Obtiene los roles requeridos desde los metadatos del endpoint
 * 2. Si no hay roles requeridos, permite el acceso
 * 3. Obtiene el usuario del request (debe venir de JwtAuthGuard)
 * 4. Verifica si el usuario tiene uno de los roles requeridos
 * 
 * Uso:
 * @Get('settings')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles(UserRole.OWNER, UserRole.ADMIN)
 * getSettings() { }
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. Obtener roles requeridos del decorador @Roles()
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 2. Si no hay roles requeridos, permitir acceso
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // 3. Obtener usuario del request (inyectado por JwtAuthGuard)
    const request = context.switchToHttp().getRequest();
    const user: UserPayload = request.user;

    if (!user) {
      this.logger.warn('Usuario no encontrado en request. ¿Falta JwtAuthGuard?');
      throw new ForbiddenException('Usuario no autenticado');
    }

    // 4. Verificar si el usuario tiene uno de los roles requeridos
    const hasRole = requiredRoles.includes(user.role as UserRole);

    if (!hasRole) {
      this.logger.warn(
        `Usuario ${user.email} con rol ${user.role} intentó acceder a endpoint que requiere roles: ${requiredRoles.join(', ')}`,
      );
      throw new ForbiddenException(
        `Acceso denegado. Se requiere uno de los siguientes roles: ${requiredRoles.join(', ')}`,
      );
    }

    this.logger.debug(
      `Usuario ${user.email} con rol ${user.role} autorizado para endpoint`,
    );

    return true;
  }
}
