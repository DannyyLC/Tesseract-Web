import { Expose, Type } from 'class-transformer';
import { SubscriptionPlan } from '@tesseract/types';

export class AdminAnalyticsOrgMarginRowDto {
  @Expose()
  organizationId: string;

  @Expose()
  organizationName: string;

  @Expose()
  plan: SubscriptionPlan;

  @Expose()
  executions: number;

  @Expose()
  costUSD: number;

  @Expose()
  creditsCharged: number;

  /** `null` cuando el plan no tiene un precio resoluble (ver `unpricedOrganizations` del overview). */
  @Expose()
  estimatedRevenueUSD: number | null;

  @Expose()
  marginUSD: number | null;

  @Expose()
  marginPct: number | null;
}

export class AdminAnalyticsOrganizationsMarginResponseDto {
  @Expose()
  @Type(() => AdminAnalyticsOrgMarginRowDto)
  items: AdminAnalyticsOrgMarginRowDto[];

  @Expose()
  page: number;

  @Expose()
  limit: number;

  @Expose()
  total: number;
}
