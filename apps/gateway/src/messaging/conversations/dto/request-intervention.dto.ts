import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestInterventionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
