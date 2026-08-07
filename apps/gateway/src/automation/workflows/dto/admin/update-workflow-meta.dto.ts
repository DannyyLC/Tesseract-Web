import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Metadata del workflow. Va aparte del config para que guardar un prompt no toque
 * la categoría ni los límites, y para que el bloqueo optimista del config no se
 * dispare por un cambio de nombre.
 */
export class UpdateWorkflowMetaDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: ['LIGHT', 'STANDARD', 'ADVANCED'] })
  @IsString()
  @IsOptional()
  @IsIn(['LIGHT', 'STANDARD', 'ADVANCED'])
  category?: 'LIGHT' | 'STANDARD' | 'ADVANCED';

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Min(1000)
  @Max(200000)
  maxTokensPerExecution?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isPaused?: boolean;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Min(30)
  @Max(3600)
  timeout?: number;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(10)
  maxRetries?: number;
}
