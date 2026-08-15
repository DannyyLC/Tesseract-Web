import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TriggerType } from '@tesseract/database';
import {
  IsEnum,
  IsNotEmpty,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * DTO para probar un workflow interno (`isInternal: true`) desde el panel de super admin.
 *
 * A diferencia de `ExecuteWorkflowDto` (tenant), la organización viaja explícita en el body
 * —igual que en `CreateWorkflowAdminDto`— porque super admin no pertenece a la organización
 * del cliente. `trigger` es opcional y por defecto `MANUAL`, pero se puede simular
 * `API`/`WEBHOOK`/etc. para acercar la prueba al escenario real que se está construyendo.
 */
export class TestExecuteWorkflowDto {
  @ApiProperty({ description: 'Organización dueña del workflow que se está probando' })
  @IsString()
  @IsNotEmpty({ message: 'La organización es requerida' })
  organizationId!: string;

  @ApiProperty({ description: 'Datos de entrada para el workflow' })
  @IsObject()
  // `@IsNotEmpty()` no rechaza un objeto vacío (solo mira `'' | null | undefined`);
  // `{}` pasaría la validación pese al mensaje. `@IsNotEmptyObject()` sí revisa que
  // tenga al menos una llave.
  @IsNotEmptyObject(undefined, { message: 'Los datos de entrada son requeridos' })
  input!: Record<string, any>;

  @ApiPropertyOptional({ description: 'Metadata adicional; no se envía al workflow' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({
    enum: TriggerType,
    default: TriggerType.MANUAL,
    description: 'Trigger a simular, para acercar la prueba al escenario real',
  })
  @IsEnum(TriggerType)
  @IsOptional()
  trigger?: TriggerType;
}
