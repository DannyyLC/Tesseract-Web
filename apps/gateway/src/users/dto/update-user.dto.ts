import { IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { UserRole } from '@tesseract/types';

export class UpdateUserDto {
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
