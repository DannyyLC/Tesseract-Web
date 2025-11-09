import { applyDecorators, UseGuards } from '@nestjs/common';
import { UserRole } from '@workflow-automation/shared-types';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from './roles.decorator';

/**
 * Decorador combinado que aplica JwtAuthGuard + RolesGuard + @Roles
 * 
 * Simplifica la protección de endpoints con roles:
 * 
 * En lugar de:
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles(UserRole.OWNER)
 * 
 * Puedes usar:
 * @RequireRoles(UserRole.OWNER)
 * 
 * Uso:
 * @Post('invite')
 * @RequireRoles(UserRole.OWNER)
 * inviteUser() {
 *   // Solo OWNER puede acceder
 * }
 * 
 * @Get('workflows')
 * @RequireRoles(UserRole.OWNER, UserRole.ADMIN)
 * getWorkflows() {
 *   // OWNER y ADMIN pueden acceder
 * }
 */
export function RequireRoles(...roles: UserRole[]) {
  return applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    Roles(...roles),
  );
}
