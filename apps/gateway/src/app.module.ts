import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { ExecutionsModule } from './executions/executions.module';
import { ApiKeysModule } from './api-keys/api-keys.module';

/**
 * Módulo raíz de la aplicación Gateway
 * 
 * Importa:
 * - ConfigModule: Para variables de entorno (.env)
 * - DatabaseModule: Para conexión a PostgreSQL
 * - AuthModule: Para sistema de autenticación con API Keys
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,  
      envFilePath: '.env',
    }),
    
    DatabaseModule,
    AuthModule,
    WorkflowsModule,
    ExecutionsModule,
    ApiKeysModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
