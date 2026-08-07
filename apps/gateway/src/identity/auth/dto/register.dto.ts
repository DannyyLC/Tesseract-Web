import { IsEmail, IsString, IsNotEmpty, MinLength } from 'class-validator';
import { NormalizeEmail } from '@/platform/common/utils/normalize-email';

/**
 * DTO para el registro de nuevos usuarios
 */
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  @NormalizeEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password: string;
}
