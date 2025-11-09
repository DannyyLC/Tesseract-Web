import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { AdminService } from './services/admin.service';
import { AuditService } from './services/audit.service';
import { SuperAdminsConfig } from './config/super-admins.config';
import { SuperAdminGuard } from './guards/super-admin.guard';

/**
 * 🔥 ADMIN MODULE
 * 
 * Módulo para administración del sistema completo
 * Solo accesible para super administradores definidos en .env
 * 
 * Características de seguridad:
 * - Super admins definidos en archivo (no en DB)
 * - JWT separado con secret diferente
 * - Rate limiting estricto
 * - IP whitelist opcional
 * - Audit logging exhaustivo
 * 
 * Endpoints disponibles:
 * - GET    /admin/organizations
 * - GET    /admin/organizations/:id
 * - PATCH  /admin/organizations/:id/plan
 * - PATCH  /admin/organizations/:id/limits
 * - PATCH  /admin/organizations/:id/status
 * - DELETE /admin/organizations/:id
 * - GET    /admin/organizations/:organizationId/users
 * - GET    /admin/users/:id
 * - PATCH  /admin/users/:id/role
 * - PATCH  /admin/users/:id/status
 * - GET    /admin/stats
 * - GET    /admin/stats/by-plan
 * - GET    /admin/stats/top-organizations
 * - GET    /admin/audit-logs
 * - GET    /admin/audit-logs/stats
 */
@Module({
  imports: [
    // JWT con configuración especial para super admins
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const superAdminsConfig = new SuperAdminsConfig(configService);
        return {
          secret: superAdminsConfig.getJwtSecret(),
          signOptions: {
            expiresIn: '30m', // Sesión corta para seguridad
          },
        };
      },
    }),
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
    AuditService,
    SuperAdminsConfig,
    SuperAdminGuard,
  ],
  exports: [
    AuditService, // Para que otros módulos puedan loggear acciones críticas
  ],
})
export class AdminModule {}
