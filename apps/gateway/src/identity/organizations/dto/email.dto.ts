import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class EmailDto {
  @ApiProperty({ description: 'Email address of the user.' })
  @IsEmail({}, { message: 'Formato de correo electrónico inválido' })
  @IsNotEmpty({ message: 'El correo electrónico es requerido' })
  email: string;
}
