import { IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { UserRole } from '@workflow-automation/shared-types';

/**
 * DTO para actualizar un usuario existente
 */
export class UpdateUserDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
