import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsArray, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO para la respuesta de ejecución del agente.
 * 
 * Este es el formato que el servicio de Python retorna después de ejecutar el agente.
 */

export class AgentMessageDto {
    @ApiProperty({
        description: 'Rol del mensaje',
        enum: ['human', 'assistant'],
        example: 'assistant',
    })
    @IsString()
    @IsNotEmpty()
    role: 'human' | 'assistant';

    @ApiProperty({
        description: 'Contenido del mensaje',
        example: 'He agendado la demo para mañana a las 3pm',
    })
    @IsString()
    @IsNotEmpty()
    content: string;
}

export class ExecutionMetadataDto {
    @ApiPropertyOptional({
        description: 'Tiempo de ejecución en milisegundos',
        example: 1250,
    })
    @IsOptional()
    execution_time_ms?: number;

    @ApiPropertyOptional({
        description: 'Tipo de grafo utilizado',
        example: 'react',
    })
    @IsOptional()
    @IsString()
    graph_type?: string;

    @ApiPropertyOptional({
        description: 'Modelo utilizado',
        example: 'gpt-4o',
    })
    @IsOptional()
    @IsString()
    model_used?: string;

    @ApiPropertyOptional({
        description: 'Tools habilitadas en la ejecución',
        example: ['google_calendar', 'hubspot'],
        type: [String],
    })
    @IsOptional()
    @IsArray()
    tools_enabled?: string[];

    @ApiPropertyOptional({
        description: 'Número total de mensajes generados',
        example: 3,
    })
    @IsOptional()
    total_messages?: number;

    @ApiPropertyOptional({
        description: 'Tokens utilizados en la conversación',
        example: 450,
    })
    @IsOptional()
    total_tokens?: number;

    @ApiPropertyOptional({
        description: 'Costo estimado en USD',
        example: 0.0023,
    })
    @IsOptional()
    cost?: number;
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
