import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateOverageSettingsDto {
  @ApiProperty({
    description: 'Whether the organization is allowed to exceed its usage limits (overages).',
  })
  @IsBoolean()
  allowOverages: boolean;

  @ApiProperty({ description: 'Maximum allowed overage limit in credits. Optional.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  overageLimit?: number;
}
