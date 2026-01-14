import { IsString, IsEmail, IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

/**
 * DTO para actualizar un usuario existente
 * Solo para administradores
 *
 * Todos los campos son opcionales, solo se actualizan los que se envían
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  plan?: string; // 'free', 'pro', 'enterprise', 'admin'

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxWorkflows?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxExecutionsPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxApiKeys?: number;

  @IsOptional()
  @IsString()
  region?: string;
}
