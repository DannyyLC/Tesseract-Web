import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ApiKeyGuard } from './guards/api-key.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AdminController } from './admin.controller';

/**
 * AuthModule agrupa toda la funcionalidad de autenticación
 * 
 * Contiene:
 * - ApiKeyGuard: Para proteger endpoints con API Keys (apps externas)
 * - JwtAuthGuard: Para proteger endpoints con JWT (usuarios humanos)
 * - JwtStrategy: Estrategia para validar JWT tokens
 * - ApiKeyUtil: Utilidades para hashear y comparar API Keys
 * - CurrentClient: Decorador para obtener el cliente autenticado (API Key)
 * - CurrentUser: Decorador para obtener el usuario autenticado (JWT)
 * 
 * Exporta:
 * - ApiKeyGuard: Para endpoints de workflows (ejecución)
 * - JwtAuthGuard: Para endpoints de gestión (API Keys, configuración)
 */
@Module({
  imports: [
    // Passport con estrategia por defecto 'jwt'
    PassportModule.register({ defaultStrategy: 'jwt' }),
    
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
  controllers: [AuthController, AdminController],
  providers: [
    ApiKeyGuard,
    JwtAuthGuard,
    AdminGuard,
    JwtStrategy,
    AuthService,
  ],
  exports: [
    ApiKeyGuard,
    JwtAuthGuard,
    AuthService,
    JwtModule,      // Para que otros módulos puedan generar tokens
    PassportModule, // Para usar estrategias en otros módulos
  ],
})
export class AuthModule {}