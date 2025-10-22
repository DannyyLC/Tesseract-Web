import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';


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
    // Configuración de variables de entorno
    ConfigModule.forRoot({
      isGlobal: true,  // Hace que las env vars estén disponibles globalmente
      envFilePath: '.env',
    }),
    
    // Base de datos
    DatabaseModule,
    
    // Autenticación
    AuthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
