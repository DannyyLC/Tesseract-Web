import { Exclude, Expose, Type } from 'class-transformer';

/**
 * DTO base para workflow asociado
 */
export class ExecutionWorkflowDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  category: string;

  @Expose()
  organizationId?: string;
}

/**
 * DTO base para usuario asociado
 */
export class ExecutionUserDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  email: string;
}

/**
 * DTO base para API Key asociada
 */
export class ExecutionApiKeyDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  keyPrefix: string;
}

/**
 * DTO para respuesta de ejecución (vista cliente)
 * No incluye campos internos como cost, tokensUsed, errorStack
 */
export class ExecutionResponseDto {
  @Expose()
  id: string;

  @Expose()
  status: string;

  @Expose()
  startedAt: Date;

  @Expose()
  finishedAt?: Date;

  @Expose()
  duration?: number;

  @Expose()
  result?: any;

  @Expose()
  error?: string;

  @Expose()
  trigger: string;

  @Expose()
  triggerData?: any;

  @Expose()
  logs?: string;

  @Expose()
  stepResults?: any;

  @Expose()
  retryCount: number;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;

  // Campos de créditos
  @Expose()
  credits?: number;

  @Expose()
  balanceBefore?: number;

  @Expose()
  balanceAfter?: number;

  @Expose()
  wasOverage: boolean;

  // IDs de relaciones
  @Expose()
  workflowId: string;

  @Expose()
  organizationId: string;

  @Expose()
  conversationId?: string;

  @Expose()
  userId?: string;

  @Expose()
  apiKeyId?: string;

  // Relaciones
  @Expose()
  @Type(() => ExecutionWorkflowDto)
  workflow?: ExecutionWorkflowDto;

  @Expose()
  @Type(() => ExecutionUserDto)
  user?: ExecutionUserDto;

  @Expose()
  @Type(() => ExecutionApiKeyDto)
  apiKey?: ExecutionApiKeyDto;
}

/**
 * DTO para respuesta de listado de ejecuciones
 * Versión simplificada para listas
 */
export class ExecutionListItemDto {
  @Expose()
  id: string;

  @Expose()
  status: string;

  @Expose()
  startedAt: Date;

  @Expose()
  finishedAt?: Date;

  @Expose()
  duration?: number;

  @Expose()
  trigger: string;

  @Expose()
  error?: string;

  @Expose()
  retryCount: number;

  // Campos de créditos
  @Expose()
  credits?: number;

  @Expose()
  balanceBefore?: number;

  @Expose()
  balanceAfter?: number;

  @Expose()
  wasOverage: boolean;

  // IDs de relaciones
  @Expose()
  workflowId: string;

  @Expose()
  organizationId: string;

  @Expose()
  conversationId?: string;

  @Expose()
  userId?: string;

  @Expose()
  apiKeyId?: string;

  // Relaciones
  @Expose()
  @Type(() => ExecutionWorkflowDto)
  workflow?: ExecutionWorkflowDto;

  @Expose()
  @Type(() => ExecutionUserDto)
  user?: ExecutionUserDto;

  @Expose()
  @Type(() => ExecutionApiKeyDto)
  apiKey?: ExecutionApiKeyDto;
}

/**
 * DTO para paginación
 */
export class ExecutionPaginationDto {
  @Expose()
  total: number;

  @Expose()
  limit: number;

  @Expose()
  nextCursor?: string;

  @Expose()
  hasMore: boolean;
}

/**
 * DTO para respuesta de listado paginado
 */
export class ExecutionListResponseDto {
  @Expose()
  @Type(() => ExecutionListItemDto)
  data: ExecutionListItemDto[];

  @Expose()
  @Type(() => ExecutionPaginationDto)
  pagination: ExecutionPaginationDto;
}

/**
 * DTO para respuesta de cancelación
 */
export class ExecutionCancelResponseDto {
  @Expose()
  success: boolean;

  @Expose()
  message: string;

  @Expose()
  @Type(() => ExecutionResponseDto)
  execution: ExecutionResponseDto;
}
