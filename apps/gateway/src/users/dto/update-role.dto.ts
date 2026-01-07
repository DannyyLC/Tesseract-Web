import { IsEnum, IsNotEmpty } from 'class-validator';
import { UserRole } from './user-role.enum';

export class UpdateRoleDto {
  @IsEnum(UserRole, {
    message: 'Role must be one of: viewer, editor, admin',
  })
  @IsNotEmpty()
  role: UserRole;
}
