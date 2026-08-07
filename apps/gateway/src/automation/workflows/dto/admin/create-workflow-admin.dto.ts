import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
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
}
