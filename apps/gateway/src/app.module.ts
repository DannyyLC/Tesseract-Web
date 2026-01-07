import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { ExecutionsModule } from './executions/executions.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { SecretsModule } from './secrets/secrets.module';


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
    
    SecretsModule,        
    DatabaseModule,
    AuthModule,
    OrganizationsModule,
    WorkflowsModule,
    ExecutionsModule,
    ApiKeysModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
