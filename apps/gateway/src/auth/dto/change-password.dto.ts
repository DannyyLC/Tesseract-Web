import { IsString, MinLength } from 'class-validator';

/**
 * DTO para cambiar la contraseña de un usuario
 * Solo para administradores (para cambiar la contraseña de otro usuario)
 */
export class ChangePasswordDto {
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  newPassword: string;
}
