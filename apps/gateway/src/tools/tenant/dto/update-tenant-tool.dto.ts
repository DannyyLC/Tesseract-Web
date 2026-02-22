import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateTenantToolDto {
  @IsString()
  @ApiProperty({ description: 'Display name for this tenant tool', example: 'Google Calendar - Sales' })
  displayName: string;
}
