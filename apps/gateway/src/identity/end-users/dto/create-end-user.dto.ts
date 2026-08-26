import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateEndUserDto as ICreateEndUserDto } from '@tesseract/types';
import { NormalizePhone } from '@/platform/common/utils/normalize-phone';

export class CreateEndUserDto implements ICreateEndUserDto {
  /**
   * Se guarda canónico (`+` y dígitos) con el mismo `normalizePhone()` que usa
   * `WhatsAppConfig.phoneNumber`: es la forma que escribe el webhook de WhatsApp en
   * `EndUser.phoneNumber` una vez normalizado ahí también, así que un contacto dado de alta
   * a mano hace match con el mensaje real de esa persona en vez de duplicarse.
   */
  @ApiProperty({ description: 'Número de WhatsApp del contacto: "+" + código de país (2 dígitos) + número (10 dígitos)' })
  @IsString()
  @NormalizePhone()
  @Matches(/^\+\d{2}\d{10}$/, {
    message: 'phoneNumber debe ser "+" seguido del código de país (2 dígitos) y el número (10 dígitos)',
  })
  phoneNumber: string;

  /** Opcional: sin nombre, el contacto se muestra por su número hasta que WhatsApp entregue uno. */
  @ApiPropertyOptional({ description: 'Nombre del contacto' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}
