import { ApiProperty } from '@nestjs/swagger';

export class StartVerificationFlowDto {
  @ApiProperty({ description: 'Nombre de usuario que inicia el flujo de verificación' })
  userName: string;

  @ApiProperty({ description: 'Correo electrónico del usuario' })
  email: string;

  @ApiProperty({ description: 'Nombre de la organización asociada al usuario' })
  organizationName: string;
}
