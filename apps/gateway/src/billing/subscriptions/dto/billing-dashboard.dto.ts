import { SubscriptionPlan } from '@tesseract/database';

export class BillingDashboardDto {
  plan: SubscriptionPlan;
  status: string;
  nextBillingDate: Date | null;
  cancelAtPeriodEnd: boolean;
  pendingPlanChange: string | null;
  allowOverages: boolean;
  overageLimit: number;
  hasBillingAccount: boolean;

  /** País de facturación (ISO 3166-1 alpha-2). NULL mientras no haya pasado por el checkout. */
  country: string | null;

  /**
   * Si la organización tiene datos fiscales aceptados por el SAT.
   *
   * Solo significa algo cuando `country` es 'MX'. El front lo usa para avisar antes de
   * contratar que sin esos datos no podrá emitirse la factura.
   */
  fiscalProfileComplete: boolean;

  credits: {
    available: number;
    usedThisMonth: number;
    limit: number;
  };

  usage: {
    workflows: {
      used: number;
      limit: number;
    };
    apiKeys: {
      used: number;
      limit: number;
    };
    users: {
      used: number;
      limit: number;
    };
    datasets: {
      used: number;
      limit: number;
    };
    datasetRows: {
      used: number;
      limit: number;
    };
  };
}
