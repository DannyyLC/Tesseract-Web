import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO para la respuesta de ejecución del agente.
 *
 * Este es el formato que el servicio de Python retorna después de ejecutar el agente.
 */

export class AgentMessageDto {
  @ApiProperty({
    description: 'Rol del mensaje',
    enum: ['user', 'assistant'],
    example: 'assistant',
  })
  @IsString()
  @IsNotEmpty()
  role: 'user' | 'assistant';

  @ApiProperty({
    description: 'Contenido del mensaje',
    example: 'He agendado la demo para mañana a las 3pm',
  })
  @IsString()
  @IsNotEmpty()
  content: string;
}

/**
 * Metadata retornado por el servicio Python sobre la ejecución.
 *
 * CAMPOS QUE PYTHON ENVÍA:
 * - execution_time_ms: Duración de la ejecución en milisegundos
 * - graph_type: Tipo de grafo ejecutado (react, supervisor, etc) - útil para analytics
 * - agents_count: Número de agentes que participaron - útil para métricas
 * - input_tokens, output_tokens, total_tokens: Contadores totales agregados
 * - usage_by_model: Desglose de tokens por modelo (crítico para calcular costos multi-modelo)
 *
 * NOTA: El Gateway usa usage_by_model para calcular costos exactos
 * consultando la tabla LlmModel. Python NO calcula costos.
 */
export class ExecutionMetadataDto {
  @ApiPropertyOptional({
    description: 'Tiempo de ejecución en milisegundos',
    example: 1250,
  })
  @IsOptional()
  execution_time_ms?: number;

  @ApiPropertyOptional({
    description: 'Tipo de grafo ejecutado (react, supervisor, router, sequential, parallel)',
    example: 'react',
  })
  @IsOptional()
  @IsString()
  graph_type?: string;

  @ApiPropertyOptional({
    description: 'Número de agentes que participaron en la ejecución',
    example: 1,
  })
  @IsOptional()
  agents_count?: number;

  @ApiPropertyOptional({
    description: 'Tokens de entrada (prompt) - retornados por Python',
    example: 350,
  })
  @IsOptional()
  input_tokens?: number;

  @ApiPropertyOptional({
    description: 'Tokens de salida (completion) - retornados por Python',
    example: 100,
  })
  @IsOptional()
  output_tokens?: number;

  @ApiPropertyOptional({
    description: 'Total de tokens (input + output)',
    example: 450,
  })
  @IsOptional()
  total_tokens?: number;

  @ApiPropertyOptional({
    description: `Usage detallado por modelo - para workflows multi-agente con diferentes modelos.
            IMPORTANTE: Python calcula esto correctamente evitando duplicados:
            - input_tokens: Máximo acumulado (LangChain reporta el total acumulativo)
            - output_tokens: Suma de todas las generaciones del modelo
            Ejemplo: Si un modelo se usa 3 veces, output_tokens = sum(gen1+gen2+gen3)`,
    example: {
      'gpt-4o': { input_tokens: 350, output_tokens: 80, total_tokens: 430 },
      'gpt-4o-mini': { input_tokens: 50, output_tokens: 20, total_tokens: 70 },
    },
  })
  @IsOptional()
  @IsObject()
  usage_by_model?: Record<
    string,
    { input_tokens: number; output_tokens: number; total_tokens: number }
  >;

  @ApiPropertyOptional({
    description:
      'Señal de escalamiento a humano emitida por una tool del agente cuando requiere intervencion.',
    example: {
      requested: true,
      reason: 'El usuario solicita hablar con soporte humano',
      tool_name: 'request_human_handoff_Soporte',
    },
  })
  @IsOptional()
  @IsObject()
  human_handoff_requested?: {
    requested: boolean;
    reason?: string;
    tool_name?: string;
  } | null;
}

export class AgentExecutionResponseDto {
  @ApiProperty({
    description: 'ID de la conversación',
    example: 'conv-789',
  })
  @IsString()
  @IsNotEmpty()
  conversation_id: string;

  @ApiProperty({
    description: 'Mensajes generados por el agente',
    type: [AgentMessageDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentMessageDto)
  messages: AgentMessageDto[];

  @ApiPropertyOptional({
    description: 'Metadata de la ejecución',
    type: ExecutionMetadataDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ExecutionMetadataDto)
  metadata?: ExecutionMetadataDto;
}
