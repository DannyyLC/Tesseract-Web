import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class DeactivateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason?: string;
}
