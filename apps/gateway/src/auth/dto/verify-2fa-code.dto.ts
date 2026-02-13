import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsNotEmpty } from "class-validator";

export class Verify2FACodeDto {
  @ApiProperty({ description: 'Código de autenticación de dos factores' })
  @IsString()
  @IsNotEmpty()
  code2FA: string;
}