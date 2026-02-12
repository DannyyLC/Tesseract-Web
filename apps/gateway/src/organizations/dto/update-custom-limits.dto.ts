import { IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCustomLimitsDto {
  @ApiProperty({ description: 'Custom maximum number of users allowed in the organization. -1 means unlimited. Optional.' })
  @IsOptional()
  @IsInt()
  @Min(-1) // -1 = ilimitado
  customMaxUsers?: number;

  @ApiProperty({ description: 'Custom maximum number of workflows allowed in the organization. -1 means unlimited. Optional.' })
  @IsOptional()
  @IsInt()
  @Min(-1)
  customMaxWorkflows?: number;

  @ApiProperty({ description: 'Custom maximum number of API keys allowed in the organization. -1 means unlimited. Optional.' })
  @IsOptional()
  @IsInt()
  @Min(-1)
  customMaxApiKeys?: number;
}
