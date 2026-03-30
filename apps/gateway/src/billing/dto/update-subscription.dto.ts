import { IsEnum, IsNotEmpty } from 'class-validator';
import { SubscriptionPlan } from '@tesseract/database'

export class UpdateSubscriptionDto {
  @IsNotEmpty()
  @IsEnum(SubscriptionPlan)
  plan: SubscriptionPlan;
}
