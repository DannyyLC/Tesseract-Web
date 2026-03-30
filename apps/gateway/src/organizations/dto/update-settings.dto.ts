import { IsOptional, IsInt, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiProperty({
    description: 'Default maximum number of messages allowed per conversation. Optional.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultMaxMessages?: number;

  @ApiProperty({
    description: 'Default number of hours before a conversation is considered inactive. Optional.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultInactivityHours?: number;

  @ApiProperty({
    description: 'Default maximum cost allowed per conversation in credits. Optional.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultMaxCostPerConv?: number;
}
