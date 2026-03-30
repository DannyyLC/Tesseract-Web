import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class ResetPasswordDto {
  @IsNotEmpty()
  @ApiProperty({ description: 'Verification code sent to user email' })
  verificationCode: string;
  @IsNotEmpty()
  @ApiProperty({ description: 'New password for the user' })
  newPassword: string;
}
