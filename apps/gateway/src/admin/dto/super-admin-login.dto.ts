import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * DTO para login de super admin
 */
export class SuperAdminLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(16)
  password: string;
}
