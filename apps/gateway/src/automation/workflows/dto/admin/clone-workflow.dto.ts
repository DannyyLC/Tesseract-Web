import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CloneWorkflowDto {
  @ApiProperty({ description: 'Organización destino' })
  @IsString()
  @IsNotEmpty({ message: 'La organización destino es requerida' })
  targetOrganizationId!: string;

  @ApiProperty({ description: 'Nombre del workflow nuevo' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
