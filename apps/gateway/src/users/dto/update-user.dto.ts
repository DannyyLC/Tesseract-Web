import { IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { UserRole, UpdateUserDto as IUpdateUserDto } from '@tesseract/types';

export class UpdateUserDto implements IUpdateUserDto {
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
