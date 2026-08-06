import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { EndUsersModule } from './end-users/end-users.module';
import { TwoFactorModule } from './two-factor/two-factor.module';

/**
 * Dominio de identidad y acceso. Agrupa y reexporta sus submódulos:
 * autenticación, usuarios, organizaciones, API keys, usuarios finales y segundo factor.
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    OrganizationsModule,
    ApiKeysModule,
    EndUsersModule,
    TwoFactorModule,
  ],
  exports: [
    AuthModule,
    UsersModule,
    OrganizationsModule,
    ApiKeysModule,
    EndUsersModule,
    TwoFactorModule,
  ],
})
export class IdentityModule {}
