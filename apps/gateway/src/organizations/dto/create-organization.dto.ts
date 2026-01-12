import {
  IsString,
  MinLength,
  MaxLength,
  IsNotEmpty,
  IsOptional,
  IsIn,
} from 'class-validator';
import { SubscriptionPlan } from '@workflow-automation/shared-types';

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @IsIn(['FREE', 'STARTER', 'GROWTH', 'BUSINESS', 'PRO', 'ENTERPRISE'])
  plan?: SubscriptionPlan;
}
