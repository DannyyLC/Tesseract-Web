import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { NormalizeEmail } from '@/platform/common/utils/normalize-email';

export class ForgotPassDto {
  @ApiProperty({ description: 'User email for password reset' })
  @IsNotEmpty()
  @IsEmail()
  @NormalizeEmail()
  email: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Token de verificación de Turnstile',
    example: '0.xxxxxxx',
    required: false,
  })
  turnstileToken?: string;
}
