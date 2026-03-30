import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { AcceptInvitationDto as IAcceptInvitationDto } from '@tesseract/types';

export class AcceptInvitationDto implements IAcceptInvitationDto {
  @ApiProperty({ description: 'Username of the invited user.' })
  @IsString({ message: 'El nombre de usuario debe ser texto' })
  @IsNotEmpty({ message: 'El nombre de usuario es requerido' })
  user: string;

  @ApiProperty({ description: 'Password for the new user account.' })
  @IsString({ message: 'La contraseña debe ser texto' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password: string;

  @ApiProperty({ description: 'Verification code sent to the user.' })
  @IsString({ message: 'El código de verificación debe ser texto' })
  @IsNotEmpty({ message: 'El código de verificación es requerido' })
  verificationCode: string;
}
