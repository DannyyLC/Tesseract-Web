import { IsString, IsIn } from 'class-validator';
import { UserRole } from '@workflow-automation/shared-types';

export class UpdateMemberRoleDto {
  @IsString()
  @IsIn([UserRole.VIEWER, UserRole.ADMIN, UserRole.OWNER])
  role: string;
}
