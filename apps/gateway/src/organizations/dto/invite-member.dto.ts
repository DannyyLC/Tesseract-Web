import { IsEmail, IsString, IsIn, IsOptional } from 'class-validator';
import { UserRole } from '@workflow-automation/shared-types';

export class InviteMemberDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsIn([UserRole.VIEWER, UserRole.ADMIN, UserRole.OWNER])
  role: string;

  @IsOptional()
  @IsString()
  name?: string;
}
