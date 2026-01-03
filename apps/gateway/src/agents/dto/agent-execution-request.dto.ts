import { IsString, IsNotEmpty, IsEnum, IsOptional, IsObject, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO para ejecutar un agente en el servicio de Python.
 * 
 * Este es el payload completo que el Gateway envía al servicio de agents.
 * Contiene TODA la información necesaria para ejecutar el agente de forma stateless.
 * 
 * El servicio de agents NO se conecta a la BD - todo viene en este payload.
 */

export enum UserType {
    INTERNAL = 'internal',
    EXTERNAL = 'external',
}

export class MessageHistoryDto {
    @ApiProperty({
        description: 'Rol del mensaje',
        enum: ['human', 'assistant', 'system'],
        example: 'human',
    })
    @IsString()
    @IsEnum(['human', 'assistant', 'system'])
    role: 'human' | 'assistant' | 'system';

    @ApiProperty({
        description: 'Contenido del mensaje',
        example: 'Hola, necesito agendar una reunión',
    })
    @IsString()
    @IsNotEmpty()
    content: string;
}

export class AgentConfigDto {
    @ApiProperty({
        description: 'Tipo de grafo del agente',
        example: 'react',
    })
    @IsString()
    @IsNotEmpty()
    graph_type: string;

    @ApiPropertyOptional({
        description: 'Máximo de iteraciones del agente',
        example: 10,
    })
    @IsOptional()
    max_iterations?: number;

    @ApiPropertyOptional({
        description: 'Si permite interrupciones humanas',
        example: false,
    })
    @IsOptional()
    allow_interrupts?: boolean;
}

export class ModelConfigDto {
    @ApiProperty({
        description: 'Nombre del modelo',
        example: 'gpt-4o',
    })
    @IsString()
    @IsNotEmpty()
    model: string;

    @ApiPropertyOptional({
        description: 'Temperatura del modelo',
        example: 0.7,
    })
    @IsOptional()
    temperature?: number;

    @ApiPropertyOptional({
        description: 'Máximo de tokens por mensaje',
        example: 1000,
    })
    @IsOptional()
    max_tokens?: number;

    @ApiPropertyOptional({
        description: 'System prompt del modelo',
        example: 'Eres un asistente de ventas...',
    })
    @IsOptional()
    systemPrompt?: string;

    @ApiPropertyOptional({
        description: 'Modelos de respaldo en caso de falla',
        example: ['claude-3-5-sonnet-20241022'],
        type: [String],
    })
    @IsOptional()
    @IsArray()
    fallbacks?: string[];

    //TODO: Agregar campos de pricing para que Python calcule los costos:
    //TODO: @ApiPropertyOptional({ description: 'Costo por millón de tokens de entrada', example: 2.5 })
    //TODO: @IsOptional()
    //TODO: input_cost_per_million?: number;
    //TODO: 
    //TODO: @ApiPropertyOptional({ description: 'Costo por millón de tokens de salida', example: 10.0 })
    //TODO: @IsOptional()
    //TODO: output_cost_per_million?: number;

    @ApiPropertyOptional({
        description: 'Número máximo de reintentos',
        example: 2,
    })
    @IsOptional()
    max_retries?: number;

    @ApiPropertyOptional({
        description: 'Timeout en segundos',
        example: 60,
    })
    @IsOptional()
    timeout?: number;
}

export class AgentExecutionRequestDto {
    // ==========================================
    // IDENTIFICACIÓN (OBLIGATORIOS)
    // ==========================================
    @ApiProperty({
        description: 'ID de la organización (tenant)',
        example: 'org-123',
    })
    @IsString()
    @IsNotEmpty()
    tenant_id: string;

    @ApiProperty({
        description: 'ID del workflow',
        example: 'workflow-456',
    })
    @IsString()
    @IsNotEmpty()
    workflow_id: string;

    @ApiProperty({
        description: 'ID de la conversación',
        example: 'conv-789',
    })
    @IsString()
    @IsNotEmpty()
    conversation_id: string;

    @ApiProperty({
        description: 'Tipo de usuario',
        enum: UserType,
        example: UserType.INTERNAL,
    })
    @IsEnum(UserType)
    user_type: UserType;

    @ApiProperty({
        description: 'ID del usuario (UUID para internal, teléfono/session para external)',
        example: 'user-123',
    })
    @IsString()
    @IsNotEmpty()
    user_id: string;

    @ApiProperty({
        description: 'Canal de origen del mensaje',
        example: 'dashboard',
    })
    @IsString()
    @IsNotEmpty()
    channel: string;

    @ApiProperty({
        description: 'Mensaje actual del usuario',
        example: 'Agenda una demo para mañana',
    })
    @IsString()
    @IsNotEmpty()
    user_message: string;

    // ==========================================
    // CONFIGURACIÓN DEL WORKFLOW 
    // ==========================================
    @ApiProperty({
        description: 'Configuración del grafo',
        example: {
            type: 'react',
            config: {
                max_iterations: 10,
                allow_interrupts: false,
            },
        },
    })
    @IsObject()
    graph_config: Record<string, any>;

    @ApiProperty({
        description: 'Configuración de agentes',
        example: {
            default: {
                model: 'gpt-4o',
                temperature: 0.7,
                system_prompt: 'Eres un asistente...',
                tools: ['tool-uuid-1', 'tool-uuid-2'],
            },
        },
    })
    @IsObject()
    agents_config: Record<string, any>;

    @ApiProperty({
        description: 'Tool instances por agente con UUIDs como keys',
        example: {
            default: {
                'tool-uuid-1': {
                    tool_name: 'google_calendar',
                    display_name: 'Calendar Ventas',
                    credentials: { token: 'xxx' },
                    config: { calendar_id: 'primary' },
                    enabled_functions: ['check_availability', 'create_event'],
                },
            },
        },
    })
    @IsObject()
    agent_tool_instances: Record<string, Record<string, any>>;

    // ==========================================
    // HISTORIAL Y METADATA
    // ==========================================
    @ApiProperty({
        description: 'Historial completo de mensajes de la conversación',
        type: [MessageHistoryDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MessageHistoryDto)
    message_history: MessageHistoryDto[];

    @ApiPropertyOptional({
        description: 'Metadata del usuario',
        example: {
            name: 'Juan Pérez',
            email: 'juan@empresa.com',
            source: 'whatsapp',
        },
    })
    @IsOptional()
    @IsObject()
    user_metadata?: Record<string, any>;

    @ApiPropertyOptional({
        description: 'Zona horaria del workflow',
        example: 'America/Mexico_City',
        default: 'UTC',
    })
    @IsOptional()
    @IsString()
    timezone?: string;
}
