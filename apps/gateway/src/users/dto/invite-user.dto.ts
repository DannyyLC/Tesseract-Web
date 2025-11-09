import { IsEmail, IsString, MinLength, IsEnum } from 'class-validator';
import { UserRole } from '@workflow-automation/shared-types';

/**
 * DTO para invitar un nuevo usuario a la organización
 */
export class InviteUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsString()
  @MinLength(8)
  password: string;
}
