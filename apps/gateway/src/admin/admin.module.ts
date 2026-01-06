import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { SuperAdminsConfig } from './config/super-admins.config';
import { SuperAdminGuard } from './guards/super-admin.guard';
import { AdminLlmModelsController } from './llm-models.controller';
import { AdminExecutionsController } from './executions.controller';
import { LlmModelsModule } from '../llm-models/llm-models.module';
import { ExecutionsModule } from '../executions/executions.module';

/**
 * ADMIN MODULE
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
 */
@Module({
  imports: [
    LlmModelsModule,
    ExecutionsModule,
    // JWT con configuración especial para super admins
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        // Obtener el secret directamente del ConfigService
        const secret = configService.get<string>('SUPER_ADMIN_SECRET');
        
        if (!secret) {
          throw new Error(
            'SUPER_ADMIN_SECRET no está definido en .env\n' +
            'Genera uno con: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
          );
        }

        if (secret.length < 32) {
          throw new Error('SUPER_ADMIN_SECRET debe tener al menos 32 caracteres');
        }

        return {
          secret: secret,
          signOptions: {
            expiresIn: '30m', // Sesión corta para seguridad
          },
        };
      },
    }),
  ],
  controllers: [AdminController, AdminLlmModelsController, AdminExecutionsController],
  providers: [
    SuperAdminsConfig,
    SuperAdminGuard,
  ],
  exports: [],
})
export class AdminModule {}
