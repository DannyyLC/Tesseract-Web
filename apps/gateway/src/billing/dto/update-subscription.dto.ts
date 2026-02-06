import { IsEnum, IsNotEmpty } from 'class-validator';
import { SubscriptionPlan } from '@prisma/client';

export class UpdateSubscriptionDto {
  @IsNotEmpty()
  @IsEnum(SubscriptionPlan)
  plan: SubscriptionPlan;
}
