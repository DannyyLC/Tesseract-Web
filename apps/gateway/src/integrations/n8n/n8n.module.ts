import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { N8nService } from './n8n.service';

/**
 * N8nModule
 * Módulo para integración con n8n
 * 
 * Contiene:
 * - N8nService: Lógica para ejecutar webhooks de n8n
 * - HttpModule: Cliente HTTP (axios) para hacer peticiones
 * 
 * Exporta:
 * - N8nService: Para que WorkflowsModule pueda usarlo
 * 
 * Configuración:
 * - Timeout global: 30 segundos
 * - Max redirects: 5
 * - Retry automático: No (lo manejamos manualmente en el service)
 */
@Module({
  imports: [
    HttpModule.register({
      timeout: 30000, // 30 segundos por defecto
      maxRedirects: 5, // Seguir hasta 5 redirects
      validateStatus: (status) => status >= 200 && status < 300, // Solo 2xx son success
    }),
  ],
  providers: [N8nService],
  exports: [N8nService], // ← Exportar para usar en WorkflowsModule
})
export class N8nModule {}