import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { GatewayController } from './gateway/gateway.controller';
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
    ClientsModule.register([
      {
        name: 'GATEWAY_KAFKA',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'gateway',
            brokers: ['20.81.187.131:9092'],
          },
          consumer: {
            groupId: 'gateway-consumer',
          },
        },
      },
    ]),
    
    DatabaseModule,
    AuthModule,
    WorkflowsModule,
  ],
  controllers: [GatewayController],
  providers: [],
})
export class AppModule {}
