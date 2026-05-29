import { IsObject, IsOptional, IsNotEmpty } from 'class-validator';
import { ExecuteWorkflowDto as IExecuteWorkflowDto } from '@tesseract/types';

/**
 * DTO para ejecutar un workflow
 *
 * El cliente envía estos datos en POST /api/workflows/:id/execute
 *
 * Los datos son flexibles porque cada workflow puede necesitar
 * diferentes inputs según su configuración
 *
 * Ejemplo de request:
 * {
 *   "input": {
 *     "leadName": "Juan Pérez",
 *     "email": "juan@example.com",
 *     "phone": "+52 123 456 7890",
 *     "source": "Facebook Ads"
 *   },
 *   "metadata": {
 *     "userId": "user-123",
 *     "campaign": "summer-2024"
 *   }
 * }
 */
export class ExecuteWorkflowDto implements IExecuteWorkflowDto {
  /**
   * Datos de entrada para el workflow
   * Puede ser cualquier estructura JSON
   *
   * Este objeto se enviará al servicio de agentes Python
   * para su procesamiento según la configuración del workflow
   */
  @IsObject()
  @IsNotEmpty({ message: 'Los datos de entrada son requeridos' })
  input!: Record<string, any>;

  /**
   * Metadata adicional (opcional)
   * Útil para tracking, analytics, debugging, etc.
   *
   * NO se envía al workflow, solo se guarda en triggerData
   */
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
