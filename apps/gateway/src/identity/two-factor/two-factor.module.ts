import { Module } from '@nestjs/common';
import { TwoFactorService } from './two-factor.service';

/**
 * Agrupa toda la lógica de segundo factor (TOTP y códigos de respaldo).
 *
 * No importa nada: PrismaService llega por el DatabaseModule global. Mantenerlo
 * sin dependencias es lo que permite que AuthModule, UsersModule y
 * OrganizationsModule lo importen sin crear ciclos.
 */
@Module({
  providers: [TwoFactorService],
  exports: [TwoFactorService],
})
export class TwoFactorModule {}
