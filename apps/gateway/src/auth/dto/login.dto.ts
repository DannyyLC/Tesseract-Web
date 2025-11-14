import { IsEmail, IsString, IsNotEmpty } from 'class-validator';

/**
 * DTO para el login de usuarios
 */
export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
