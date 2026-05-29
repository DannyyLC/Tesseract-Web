import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@tesseract/types';

/**
 * Clave para almacenar los roles requeridos en los metadatos del endpoint
 */
export const ROLES_KEY = 'roles';

/**
 * Decorador para especificar qué roles pueden acceder a un endpoint
 *
 * Uso:
 * @Get('settings')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles(UserRole.OWNER, UserRole.ADMIN)
 * getSettings() {
 *   // Solo OWNER y ADMIN pueden acceder
 * }
 *
 * @Post('invite')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles(UserRole.OWNER)
 * inviteUser() {
 *   // Solo OWNER puede acceder
 * }
 *
 * Requisito: Debe usarse junto con RolesGuard
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
