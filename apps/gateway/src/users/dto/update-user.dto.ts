import { IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { UserRole } from '@workflow-automation/shared-types';

export class UpdateUserDto {
    @IsEnum(UserRole)
    @IsOptional()
    role?: UserRole;

    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}
