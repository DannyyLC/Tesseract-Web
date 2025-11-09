import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { ExecutionsModule } from './executions/executions.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';

/**
 * Módulo raíz de la aplicación Gateway
 * 
 * Importa:
 * - ConfigModule: Para variables de entorno (.env)
 * - DatabaseModule: Para conexión a PostgreSQL
 * - AuthModule: Para sistema de autenticación con JWT y API Keys
 * - OrganizationsModule: Para gestión de organizaciones multi-tenant
 * - UsersModule: Para gestión de usuarios y roles
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        '.env',                    // En apps/gateway/.env
        '../../.env',              // En la raíz del monorepo
      ],
      ignoreEnvFile: false,
    }),
    
    DatabaseModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    WorkflowsModule,
    ExecutionsModule,
    ApiKeysModule,
    AdminModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
