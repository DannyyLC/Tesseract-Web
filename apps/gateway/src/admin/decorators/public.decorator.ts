import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorador para marcar endpoints como públicos (sin SuperAdminGuard)
 * 
 * Usar solo en /admin/login
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
