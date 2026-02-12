import { IsString, MinLength, MaxLength, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { SubscriptionPlan } from '@workflow-automation/shared-types';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiProperty({ description: 'Name of the new organization. Must be 2-100 characters.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'Subscription plan for the new organization. Optional.' })
  @IsString()
  @IsOptional()
  @IsIn(['FREE', 'STARTER', 'GROWTH', 'BUSINESS', 'PRO', 'ENTERPRISE'])
  plan?: SubscriptionPlan;
}
