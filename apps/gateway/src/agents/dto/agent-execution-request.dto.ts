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
        description: `Configuración del grafo - FLEXIBLE para soportar múltiples tipos:
            - react: { type: 'react', config: { max_iterations: 10, allow_interrupts: false } }
            - supervisor: { type: 'supervisor', config: { supervisor_model: 'gpt-4o', members: [...] } }
            - parallel: { type: 'parallel', config: { branches: [...], merge_strategy: 'first' } }
            - sequential: { type: 'sequential', config: { steps: [...] } }
            - router: { type: 'router', config: { routes: {...}, fallback: '...' } }`,
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
        description: `Configuración de agentes por nombre (default, sales, support, etc).
            
            Campos: model (requerido), temperature, max_tokens, system_prompt, fallbacks, max_retries, timeout.
            
            NOTA: El campo 'tools' NO se envía aquí (aunque existe en BD).
            - Gateway lo usa internamente para filtrar agent_tool_instances
            - Python solo lee agent_tool_instances, no necesita ver 'tools'`,
        example: {
            default: {
                model: 'gpt-4o',
                temperature: 0.7,
                max_tokens: 1000,
                system_prompt: 'Eres un asistente...',
                fallbacks: ['claude-3-5-sonnet-20241022'],
                max_retries: 2,
                timeout: 60
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
