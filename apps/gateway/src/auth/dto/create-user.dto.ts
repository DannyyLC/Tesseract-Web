import {
  IsEmail,
  IsString,
  IsNotEmpty,
  MinLength,
  IsOptional,
  IsIn,
} from 'class-validator';

/**
 * DTO para crear usuarios desde panel de administración
 * Solo accesible por administradores
 */
export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password: string;

  @IsOptional()
  @IsIn(['free', 'pro', 'enterprise', 'admin'])
  plan?: string;

  @IsOptional()
  maxWorkflows?: number;

  @IsOptional()
  maxExecutionsPerDay?: number;

  @IsOptional()
  maxApiKeys?: number;
}
