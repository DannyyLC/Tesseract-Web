import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty } from "class-validator";

export class ForgotPassDto {
    @ApiProperty({ description: 'User email for password reset' })
    @IsNotEmpty()
    @IsEmail()
    email: string;
}