import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { SubscriptionPlan } from '@tesseract/types';
import { IsCountry } from '@/platform/common/utils/resolve-country';

export class CreateCheckoutRequestDto {
  @ApiProperty({ enum: SubscriptionPlan, description: 'Plan to subscribe to.' })
  @IsEnum(SubscriptionPlan)
  plan: SubscriptionPlan;

  @ApiProperty({
    description:
      'ISO 3166-1 alpha-2 billing country. Required only the first time: it is stored on the ' +
      'organization and every later checkout reuses it. Once stored it cannot be changed, ' +
      'because Stripe locks the customer currency on the first invoice.',
    example: 'MX',
    required: false,
  })
  @IsOptional()
  @IsCountry()
  country?: string;
}
