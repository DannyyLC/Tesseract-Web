import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateWorkflowDto } from '../create-workflow.dto';

/**
 * Igual que CreateWorkflowDto pero con la organización explícita: el super admin no
 * pertenece a la organización del cliente, así que no se puede tomar del JWT.
 */
export class CreateWorkflowAdminDto extends CreateWorkflowDto {
  @ApiProperty({ description: 'Organización dueña del workflow' })
  @IsString()
  @IsNotEmpty({ message: 'La organización es requerida' })
  organizationId!: string;

  @ApiPropertyOptional({ description: 'Nota inicial para el historial' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({
    description:
      'Workflow interno: oculto para el cliente, no gasta créditos ni cuenta en sus ' +
      'estadísticas ni en el límite de workflows de su plan. Solo se ejecuta vía los ' +
      'endpoints de test-execute de super admin.',
  })
  @IsBoolean()
  @IsOptional()
  isInternal?: boolean;
}
