import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';
import { NormalizeEmail } from '@/platform/common/utils/normalize-email';

export class ResetPasswordDto {
  @IsNotEmpty()
  @IsEmail()
  @NormalizeEmail()
  @ApiProperty({ description: 'Email the verification code was sent to' })
  email: string;
  @IsNotEmpty()
  @ApiProperty({ description: 'Verification code sent to user email' })
  verificationCode: string;
  @IsNotEmpty()
  @ApiProperty({ description: 'New password for the user' })
  newPassword: string;
}
