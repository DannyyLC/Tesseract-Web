import { IsString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RenameConversationAdminDto {
  @ApiProperty({ description: 'Organización dueña de la conversación' })
  @IsUUID()
  organizationId!: string;

  @ApiProperty({ description: 'Nuevo título' })
  @IsString()
  @MinLength(1)
  title!: string;
}
