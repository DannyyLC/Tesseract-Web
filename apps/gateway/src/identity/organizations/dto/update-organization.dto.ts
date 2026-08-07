import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UpdateOrganizationDto as IUpdateOrganizationDto } from '@tesseract/types';
import { IsTimezone } from '../../../platform/common/utils/resolve-timezone';

export class UpdateOrganizationDto implements IUpdateOrganizationDto {
  @ApiProperty({
    description: 'The new name for the organization. Optional. Must be 2-100 characters.',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiProperty({
    description:
      'IANA timezone for the organization, e.g. "America/Mexico_City". Optional. ' +
      'Drives the hourly charts and the local time injected into the agents.',
    example: 'America/Mexico_City',
    required: false,
  })
  @IsOptional()
  @IsTimezone()
  timezone?: string;
}
