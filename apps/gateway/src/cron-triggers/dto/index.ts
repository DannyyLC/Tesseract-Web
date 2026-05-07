import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCronTriggerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsString()
  cronExpression: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @MinLength(1)
  triggerMessage: string;

  @IsUUID()
  workflowId: string;

  @IsUUID()
  @IsOptional()
  whatsAppConfigId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateCronTriggerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  cronExpression?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  triggerMessage?: string;

  @IsUUID()
  @IsOptional()
  whatsAppConfigId?: string;
}

export class SetActiveCronTriggerDto {
  @IsBoolean()
  isActive: boolean;
}
