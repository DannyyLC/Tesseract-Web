import { IsOptional, IsInt, IsNumber, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultMaxMessages?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultInactivityHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultMaxCostPerConv?: number;
}
