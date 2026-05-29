import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { EndUsersModule } from './end-users/end-users.module';

/**
 * Dominio de identidad y acceso. Agrupa y reexporta sus submódulos:
 * autenticación, usuarios, organizaciones, API keys y usuarios finales.
 */
@Module({
  imports: [AuthModule, UsersModule, OrganizationsModule, ApiKeysModule, EndUsersModule],
  exports: [AuthModule, UsersModule, OrganizationsModule, ApiKeysModule, EndUsersModule],
})
export class IdentityModule {}
