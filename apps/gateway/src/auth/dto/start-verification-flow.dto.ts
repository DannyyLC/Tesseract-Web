import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class StartVerificationFlowDto {
  @ApiProperty({ description: 'Nombre de usuario que inicia el flujo de verificación' })
  @IsString()
  @IsNotEmpty()
  userName: string;

  @ApiProperty({ description: 'Correo electrónico del usuario' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Nombre de la organización asociada al usuario' })
  @IsString()
  @IsNotEmpty()
  organizationName: string;
}
