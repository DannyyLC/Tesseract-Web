import { IsEmail, IsNotEmpty } from 'class-validator';

export class VerificationCodeDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  verificationCode: string;
}
