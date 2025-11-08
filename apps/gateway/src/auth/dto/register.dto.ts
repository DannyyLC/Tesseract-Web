import { IsEmail, IsString, IsNotEmpty, MinLength } from 'class-validator';

/**
 * DTO para el registro de nuevos usuarios
 */
export class RegisterDto {
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
}
