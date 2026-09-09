import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SetWhatsappOutboundDefaultDto {
  @IsString()
  @ApiProperty({ description: 'Workflow al que aplica la preferencia de número remitente' })
  workflowId: string;

  /** `null`/ausente = borrar la preferencia (vuelve a caer en el primero de la lista). */
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'WhatsAppConfig a usar como remitente por defecto' })
  whatsappConfigId?: string | null;
}
