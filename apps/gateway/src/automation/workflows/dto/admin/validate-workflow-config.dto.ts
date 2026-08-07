import { IsNotEmpty, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Dry-run: valida sin escribir nada. */
export class ValidateWorkflowConfigDto {
  @ApiProperty({ description: 'Config a validar' })
  @IsObject()
  @IsNotEmpty({ message: 'El config es requerido' })
  config!: Record<string, any>;
}
