import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestWithSuperAdmin } from '../interfaces/request-with-super-admin.interface';

/**
 * 🔒 Decorador para obtener el super admin actual
 * 
 * Extrae la información del super admin del request después de pasar SuperAdminGuard
 * 
 * Uso:
 * @UseGuards(SuperAdminGuard)
 * @Get('admin/organizations')
 * getAllOrganizations(@CurrentSuperAdmin() superAdmin: { id: string, email: string, name: string }) {
 *   console.log(`Super admin ${superAdmin.email} está accediendo...`);
 *   ...
 * }
 */
export const CurrentSuperAdmin = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithSuperAdmin>();
    return request.superAdmin;
  },
);
