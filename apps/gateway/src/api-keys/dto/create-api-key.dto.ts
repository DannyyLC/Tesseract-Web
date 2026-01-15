import { IsString, IsOptional, MaxLength, IsNotEmpty, IsDateString } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsNotEmpty()
  workflowId: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
