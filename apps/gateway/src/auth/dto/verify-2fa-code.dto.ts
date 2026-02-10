import { ApiProperty } from "@nestjs/swagger";

export class Verify2FACodeDto {
  @ApiProperty({ description: 'Código de autenticación de dos factores' })
  code2FA: string;
}