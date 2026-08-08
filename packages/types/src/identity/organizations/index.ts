export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  defaultMaxMessages?: number;
  defaultInactivityHours?: number;
  defaultMaxCostPerConv?: number;
  allowOverages: boolean;
  overageLimit?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  /** Zona IANA. Fuente de verdad para las gráficas y la hora local de los agentes. */
  timezone: string;
  shardKey?: string;
  /** Infraestructura (sharding), no facturación. Para la moneda de cobro es `country`. */
  region?: string;
  metadata?: any;
  /**
   * País de facturación (ISO 3166-1 alpha-2). Determina la moneda de cobro.
   * Ausente mientras la organización no haya contratado; se escribe en el checkout y no
   * vuelve a cambiar (ver `UpdateOrganizationDto`).
   */
  country?: string;
  stripeCustomerId?: string;
}

export interface Subscription {
  id: string;
  organizationId: string;
  plan: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  /** Moneda en la que se cobra esta suscripción, tomada de la factura de Stripe. */
  currency: string;
  customMonthlyPrice?: number;
  customMonthlyCredits?: number;
  customMaxWorkflows?: number;
  customOverageLimit?: number;
  customFeatures?: any;
  createdAt: Date;
  updatedAt: Date;
  canceledAt?: Date;
}
export interface DashboardOrganizationDto {
  id: string;
  name: string;
  plan: string;
  allowOverages: boolean;
  overageLimit: number | null;
  isActive: boolean;
  createdAt: Date;
  timezone: string;
  /** Solo lectura: se define al contratar y no se edita desde la aplicación. */
  country: string | null;
  customMaxUsers: number | null;
  customMaxApiKeys: number | null;
  customMaxWorkflows: number | null;
  subscriptionData?: DashboardSubscriptionDto | null;
}

/**
 * Campos editables de la organización.
 *
 * `country` **no** está aquí a propósito: Stripe congela la moneda del Customer en su primera
 * factura, así que cambiarlo después obligaría a crear un Customer nuevo y dejaría huérfana
 * cualquier deuda de overage pendiente. Se escribe una sola vez, en el checkout.
 */
export interface UpdateOrganizationDto {
  name?: string;
  timezone?: string;
}

export interface InviteUserDto {
  email: string;
}

export interface AcceptInvitationDto {
  user: string;
  password?: string;
  verificationCode: string;
}

export interface DashboardSubscriptionDto {
  plan: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  customMonthlyPrice: number | null;
  customMonthlyCredits?: number | null;
  customMaxWorkflows?: number | null;
  customFeatures?: any | null;
}

export interface DeleteOrganizationDto {
  confirmationText: string;
  code2FA?: string;
}
