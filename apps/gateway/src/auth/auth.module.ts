import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ApiKeyGuard } from './guards/api-key.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * AuthModule agrupa toda la funcionalidad de autenticación
 * 
 * Contiene:
 * - ApiKeyGuard: Para proteger endpoints con API Keys (apps externas)
 * - JwtAuthGuard: Para proteger endpoints con JWT (usuarios humanos)
 * - RolesGuard: Para verificar roles de usuario (owner/admin/viewer)
 * - JwtStrategy: Estrategia para validar JWT tokens
 * - CurrentUser: Decorador para obtener el usuario autenticado (JWT)
 * - CurrentApiKey: Decorador para obtener la API key autenticada
 * - @Roles: Decorador para especificar roles requeridos
 * 
 * Exporta:
 * - ApiKeyGuard: Para endpoints de workflows (ejecución)
 * - JwtAuthGuard: Para endpoints de gestión (API Keys, configuración)
 * - RolesGuard: Para verificar permisos basados en roles
 */
@Module({
  imports: [
    // Passport con estrategia por defecto 'jwt'
    PassportModule.register({ defaultStrategy: 'jwt' }),
    NotificationsModule,
    // Configuración de JWT
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const expiresIn = configService.get<string>('JWT_EXPIRES_IN') || '15m';
        return {
          secret: configService.get<string>('JWT_SECRET') || 'your-secret-key-change-in-production',
          signOptions: {
            expiresIn: expiresIn as any, // Cast necesario debido a limitación de tipos
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    ApiKeyGuard,
    JwtAuthGuard,
    RolesGuard,
    JwtStrategy,
    AuthService,
  ],
  exports: [
    ApiKeyGuard,
    JwtAuthGuard,
    RolesGuard,
    AuthService,
    JwtModule,      // Para que otros módulos puedan generar tokens
    PassportModule, // Para usar estrategias en otros módulos
  ],
})
export class AuthModule {}