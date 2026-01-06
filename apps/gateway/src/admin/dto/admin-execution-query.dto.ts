import { IsOptional, IsString } from 'class-validator';
import { ExecutionQueryDto, ExecutionStatsQueryDto } from '../../executions/dto';

/**
 * DTO para query params de admin - extiende el DTO de cliente
 * Permite especificar organizationId (opcional para super admins)
 */
export class AdminExecutionQueryDto extends ExecutionQueryDto {
  @IsOptional()
  @IsString()
  organizationId?: string;
}

/**
 * DTO para stats de admin
 */
export class AdminExecutionStatsQueryDto extends ExecutionStatsQueryDto {
  @IsOptional()
  @IsString()
  organizationId?: string;
}

/**
 * DTO para query de un solo recurso con organizationId
 */
export class AdminResourceQueryDto {
  @IsOptional()
  @IsString()
  organizationId?: string;
}

/**
 * DTO para analytics por fuente
 */
export class AdminAnalyticsSourceQueryDto {
  @IsOptional()
  @IsString()
  workflowId?: string;

  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsOptional()
  @IsString()
  period?: string = '30d';
}
