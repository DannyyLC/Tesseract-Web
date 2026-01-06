import { IsOptional, IsInt, Min } from 'class-validator';

export class UpdateCustomLimitsDto {
  @IsOptional()
  @IsInt()
  @Min(-1) // -1 = ilimitado
  customMaxUsers?: number;

  @IsOptional()
  @IsInt()
  @Min(-1)
  customMaxWorkflows?: number;

  @IsOptional()
  @IsInt()
  @Min(-1)
  customMaxApiKeys?: number;
}
