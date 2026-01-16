import { IsEmail, IsNotEmpty, IsString, MinLength, IsEnum, IsOptional } from 'class-validator';
import { UserRole } from '@workflow-automation/shared-types';

export class InviteUserDto {
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Name must be at least 2 characters long' })
  name: string;

  @IsEnum(UserRole, {
    message: 'Role must be one of: viewer, admin, owner',
  })
  @IsOptional()
  role?: UserRole;
}
