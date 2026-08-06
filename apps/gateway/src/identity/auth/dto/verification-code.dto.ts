import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';
import { NormalizeEmail } from '@/platform/common/utils/normalize-email';

export class VerificationCodeDto {
  @ApiProperty({ description: 'Correo electrónico del usuario' })
  @IsNotEmpty()
  @IsEmail()
  @NormalizeEmail()
  email: string;

  @ApiProperty({ description: 'Código de verificación enviado al correo electrónico' })
  @IsNotEmpty()
  verificationCode: string;
}
