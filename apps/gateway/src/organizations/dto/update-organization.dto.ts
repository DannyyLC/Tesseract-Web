import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UpdateOrganizationDto as IUpdateOrganizationDto } from '@tesseract/types';

export class UpdateOrganizationDto implements IUpdateOrganizationDto {
  @ApiProperty({
    description: 'The new name for the organization. Optional. Must be 2-100 characters.',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;
}
