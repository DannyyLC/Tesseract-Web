import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ClientPayload } from '@/common/types/client-payload.type';

/**
 * Decorador para obtener el usuario autenticado desde el JWT
 * 
 * Uso:
 * @Post()
 * @UseGuards(JwtAuthGuard)
 * create(@CurrentUser() user: ClientPayload) {
 *   console.log(user.email); // Email del usuario autenticado
 *   console.log(user.id);    // ID del cliente
 * }
 * 
 * Requisito: El endpoint debe estar protegido con JwtAuthGuard
 * para que request.user exista (lo inyecta JwtStrategy)
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): ClientPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
