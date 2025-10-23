import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsBoolean,
  IsInt,
  Min,
  Max,
  MaxLength,
  MinLength,
  IsIn,
  IsArray,
  IsUUID,
} from 'class-validator';

/**
 * DTO para crear un nuevo workflow
 * Valida todos los campos que vienen en el body de la petición
 */
export class CreateWorkflowDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  @MaxLength(100, { message: 'El nombre no puede tener más de 100 caracteres' })
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsObject()
  @IsNotEmpty({ message: 'El config es requerido' })
  config!: WorkflowConfig;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isPaused?: boolean;

  // Cron expression para ejecución programada
  @IsString()
  @IsOptional()
  schedule?: string;

  // Zona horaria (opcional, por defecto UTC)
  @IsString()
  @IsOptional()
  timezone?: string;

  // Timeout en segundos (opcional, 30-3600)
  @IsInt()
  @IsOptional()
  @Min(30)
  @Max(3600)
  timeout?: number;

  // Número máximo de reintentos (opcional, 0-10)
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(10)
  maxRetries?: number;

  // Tipo de trigger (opcional)
  @IsString()
  @IsOptional()
  @IsIn(['api', 'schedule', 'webhook', 'whatsapp'])
  triggerType?: string;

  // IDs de tags a asociar (opcional)
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds?: string[];
}

/**
 * Tipo para la configuración del workflow
 * Puede ser n8n o custom
 */
export type WorkflowConfig = N8nWorkflowConfig | CustomWorkflowConfig;

/**
 * Configuración para workflows de tipo n8n
 */
export interface N8nWorkflowConfig {
  type: 'n8n';
  webhookUrl: string;
  method: string;
  headers?: Record<string, string>;
  timeout?: number;
  retryOnFail?: boolean;
  retryDelay?: number;
  maxRetries?: number;
}

/**
 * Configuración para workflows custom
 */
export interface CustomWorkflowConfig {
  type: 'custom';
  steps?: any[];
  endpoint?: string;
  onError?: {
    action: string;
    to?: string;
    includeStackTrace?: boolean;
  };
  parallel?: boolean;
  continueOnError?: boolean;
}