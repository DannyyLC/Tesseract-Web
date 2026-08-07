import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';
import { NormalizeEmail } from '@/platform/common/utils/normalize-email';

export class EmailDto {
  @ApiProperty({ description: 'Email address of the user.' })
  @IsEmail({}, { message: 'Formato de correo electrónico inválido' })
  @IsNotEmpty({ message: 'El correo electrónico es requerido' })
  @NormalizeEmail()
  email: string;
}
