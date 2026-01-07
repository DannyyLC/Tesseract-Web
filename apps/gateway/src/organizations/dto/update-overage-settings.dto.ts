import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateOverageSettingsDto {
  @IsBoolean()
  allowOverages: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  overageLimit?: number;
}
