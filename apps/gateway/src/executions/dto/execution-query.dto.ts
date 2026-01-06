import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsIn,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * DTO para query params de listado de ejecuciones
 */
export class ExecutionQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsIn(['pending', 'running', 'completed', 'failed', 'cancelled', 'timeout'])
  status?: string;

  @IsOptional()
  @IsString()
  workflowId?: string;

  @IsOptional()
  @IsIn(['api', 'webhook', 'schedule', 'manual', 'whatsapp'])
  trigger?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (typeof value === 'boolean') return value;
    return undefined;
  })
  @IsBoolean()
  wasOverage?: boolean;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  apiKeyId?: string;
}

/**
 * DTO para query params de estadísticas
 */
export class ExecutionStatsQueryDto {
  @IsOptional()
  @IsIn(['24h', '7d', '30d', '90d', 'all'])
  period?: string = '7d';
}
