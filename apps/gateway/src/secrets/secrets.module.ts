import { Module, Global } from '@nestjs/common';
import { SecretsService } from './secrets.service';

/**
 * SecretsModule
 * 
 * Módulo global que proporciona el SecretsService a toda la aplicación.
 * 
 * Al ser @Global(), no necesita ser importado en cada módulo que lo use.
 * Cualquier servicio puede inyectar SecretsService directamente.
 * 
 * Uso:
 *   constructor(private secretsService: SecretsService) {}
 */
@Global()
@Module({
  providers: [SecretsService],
  exports: [SecretsService],
})
export class SecretsModule {}
