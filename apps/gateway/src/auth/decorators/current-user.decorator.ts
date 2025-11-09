import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserPayload } from '../../common/types/jwt-payload.type';

/**
 * Decorador para obtener el usuario autenticado desde el JWT
 * 
 * Uso:
 * @Post()
 * @UseGuards(JwtAuthGuard)
 * create(@CurrentUser() user: UserPayload) {
 *   console.log(user.email);          // Email del usuario
 *   console.log(user.role);           // Rol: owner/admin/viewer
 *   console.log(user.organizationId); // ID de la organización
 * }
 * 
 * Requisito: El endpoint debe estar protegido con JwtAuthGuard
 * para que request.user exista (lo inyecta JwtStrategy)
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): UserPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
