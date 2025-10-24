import { Module } from '@nestjs/common';
import { ApiKeyGuard } from './guards/api-key.guard';

/**
 * AuthModule agrupa toda la funcionalidad de autenticación
 * 
 * Contiene:
 * - ApiKeyGuard: Para proteger endpoints con API Keys
 * - ApiKeyUtil: Utilidades para hashear y comparar API Keys
 * - CurrentClient: Decorador para obtener el cliente autenticado
 * 
 * Exporta:
 * - ApiKeyGuard: Para que otros módulos puedan usarlo con @UseGuards()
 */
@Module({
  providers: [ApiKeyGuard],
  exports: [ApiKeyGuard],
})
export class AuthModule {}