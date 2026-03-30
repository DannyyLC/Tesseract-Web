import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';

/**
 * DTO para el login de usuarios
 */
export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Correo electrónico del usuario',
    example: 'admin@acme.com',
  })
  email: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Contraseña del usuario',
    example: 'Password123!',
  })
  password: string;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Indica si el usuario desea que la sesión se recuerde',
    example: true,
    required: false,
  })
  rememberMe?: boolean;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Token de verificación de Turnstile',
    example: '0.xxxxxxx',
    required: false,
  })
  turnstileToken?: string;
}
