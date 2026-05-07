import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateTemplateDto {
    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    displayName?: string;

    @IsOptional()
    @IsString()
    language?: string;

    /**
     * Nombres de variables por componente, en orden posicional.
     * Ejemplo: { "body": ["nombre_paciente", "fecha_cita"], "header": [], "buttons": [] }
     */
    @IsOptional()
    @IsObject()
    variables?: { body?: string[]; header?: string[]; buttons?: string[] };
}

export class UpdateTemplateDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    displayName?: string;

    @IsOptional()
    @IsString()
    language?: string;

    @IsOptional()
    @IsObject()
    variables?: { body?: string[]; header?: string[]; buttons?: string[] };

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class SendTemplateDto {
    @IsString()
    to: string;

    @IsString()
    templateId: string;

    /**
     * Valores reales para cada variable del template, en orden posicional.
     * Ejemplo: { "body": ["Juan López", "mañana a las 10 AM"] }
     */
    @IsObject()
    variables: { body?: string[]; header?: string[]; buttons?: string[] };
}
