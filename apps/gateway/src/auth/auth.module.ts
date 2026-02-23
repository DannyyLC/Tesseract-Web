import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { TurnstileService } from './turnstile.service';
import { AuthController } from './controllers/user-ui/auth.controller';
import { ApiKeyGuard } from './guards/api-key.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { UtilityModule } from '../utility/utility.module';
import { NotificationsModule } from '../notifications/notifications.module';
/**
 * AuthModule agrupa toda la funcionalidad de autenticación
 */
@Module({
  imports: [
    // Database para PrismaService
    // Passport con estrategia por defecto 'jwt'
    UtilityModule,
    NotificationsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Configuración de JWT
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const expiresIn = configService.get<string>('JWT_EXPIRES_IN') ?? '15m';
        return {
          secret: configService.get<string>('JWT_SECRET') ?? 'your-secret-key-change-in-production',
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
    GoogleStrategy,
    AuthService,
    TurnstileService,
  ],
  exports: [ApiKeyGuard, JwtAuthGuard, RolesGuard, AuthService, PassportModule, TurnstileService],
})
export class AuthModule {}
