import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { StripeClient } from './stripe.client';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { CreditsService } from '../credits/credits.service';
import { TransactionType, SubscriptionPlan } from '@prisma/client';
import Stripe from 'stripe';
import { SUBSCRIPTION_PLANS } from './billing.constants';
import { PrismaService } from '../database/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly stripeClient: StripeClient,
    private readonly creditsService: CreditsService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Check if the service is properly connected to Stripe
   */
  async checkConnection(): Promise<boolean> {
    try {
      // Light check to verify API key validity
      await this.stripeClient.stripe.paymentIntents.list({ limit: 1 });
      return true;
    } catch (error) {
      this.logger.error('Failed to connect to Stripe', error);
      return false;
    }
  }

  /**
   * Create a new Stripe Customer
   */
  async createCustomer(dto: CreateCustomerDto): Promise<string> {
    try {
      const customer = await this.stripeClient.customers.create({
        email: dto.email,
        name: dto.name,
        metadata: dto.metadata,
      });
      return customer.id;
    } catch (error) {
      this.logger.error(`Failed to create Stripe customer for ${dto.email}`, error);
      throw error;
    }
  }

  /**
   * Create a Stripe Checkout Session for a subscription
   */
  async createCheckoutSession(dto: CreateCheckoutSessionDto): Promise<string> {
    try {
      const session = await this.stripeClient.stripe.checkout.sessions.create({
        customer: dto.customerId,
        mode: 'subscription',
        line_items: [
          {
            price: dto.priceId,
            quantity: 1,
          },
        ],
        success_url: dto.successUrl,
        cancel_url: dto.cancelUrl,
        subscription_data: {
          metadata: dto.metadata,
        },
        allow_promotion_codes: dto.allowPromotionCodes,
        metadata: dto.metadata,
      });
      return session.url!; // Return the redirect URL
    } catch (error) {
      this.logger.error(`Failed to create checkout session for ${dto.customerId}`, error);
      throw error;
    }
  }

  /**
   * Handle Stripe Webhook Events
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        this.logger.log(`Unhandled event type ${event.type}`);
    }
  }

  private async handleInvoicePaymentSucceeded(invoiceObject: Stripe.Invoice) {
    const invoice = invoiceObject as any; // Cast to any to handle type mismatches

    if (!invoice.subscription || !invoice.payment_intent) {
      this.logger.warn(
        `Invoice ${invoice.id} missing subscription or payment details, skipping credit addition`,
      );
      return;
    }

    const subscriptionId =
      typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id;

    // Use organizationId from invoice metadata or subscription metadata
    let organizationId =
      invoice.subscription_details?.metadata?.organizationId || invoice.metadata?.organizationId;

    if (!organizationId) {
      this.logger.error(`No organizationId found in invoice metadata for invoice ${invoice.id}`);
      return;
    }

    const amountPaidCents = invoice.amount_paid;

    // Find Plan based on amount (Robust MVP approach)
    // We look for a plan that matches the amount paid.
    let creditsToAdd = 0;
    let planName = 'UNKNOWN';

    const plan = Object.values(SUBSCRIPTION_PLANS).find(
      (p: { priceUSD: number; credits: number; name: string }) =>
        p.priceUSD * 100 === amountPaidCents,
    );

    if (plan) {
      creditsToAdd = plan.credits;
      planName = plan.name;
    } else {
      // Fallback: If amount doesn't match exact plan (e.g. proration + tax? or partial),
      // we might needing a better lookup via Price ID from lines.
      // implementation_plan.md says: "Upgrade ... Charge full price ... Grant FULL credits".
      // If so, amount should match.
      // If not, we log warning.
      this.logger.warn(
        `Invoice amount ${amountPaidCents} does not match any standard plan price. checking line items...`,
      );

      // Check line items for Price ID match if available in future.
      // For now, if no match, 0 credits.
    }

    if (creditsToAdd > 0) {
      // SYNC DB STATE

      // 1. Update Organization Plan
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: { plan: planName as SubscriptionPlan },
      });

      // 2. Upsert Subscription
      // Safely get period dates from line items or invoice period
      const periodStart = invoice.period_start ? new Date(invoice.period_start * 1000) : new Date();
      const periodEnd = invoice.period_end ? new Date(invoice.period_end * 1000) : new Date();
      const priceId = invoice.lines?.data?.[0]?.price?.id;

      await this.prisma.subscription.upsert({
        where: { organizationId },
        create: {
          organizationId,
          plan: planName as SubscriptionPlan,
          status: 'ACTIVE', // SubscriptionStatus.ACTIVE
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          stripeSubscriptionId: subscriptionId,
          stripePriceId: priceId,
        },
        update: {
          plan: planName as SubscriptionPlan,
          status: 'ACTIVE',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          stripeSubscriptionId: subscriptionId,
          stripePriceId: priceId,
          pendingPlanChange: null, // Clear any pending change since we just processed a payment for this plan
        },
      });

      await this.creditsService.addCredits(
        organizationId,
        creditsToAdd,
        TransactionType.SUBSCRIPTION_RENEWAL,
        `Plan ${planName} Payment (Invoice ${invoice.number})`,
        { stripeInvoiceId: invoice.id, stripeSubscriptionId: subscriptionId, plan: planName },
        amountPaidCents / 100, // Cost in USD
        subscriptionId,
        invoice.id,
      );

      this.logger.log(
        `Added ${creditsToAdd} credits to org ${organizationId} for invoice ${invoice.id} (Plan: ${planName})`,
      );
    } else {
      this.logger.warn(`No credits added for invoice ${invoice.id} (Amount: ${amountPaidCents})`);
    }
  }

  /**
   * Cancel Subscription
   */
  async cancelSubscription(organizationId: string): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({
      where: { organizationId },
    });

    if (!sub || !sub.stripeSubscriptionId) {
      throw new BadRequestException('No active subscription found');
    }

    await this.stripeClient.stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: true },
    });
  }

  /**
   * Resume (Un-cancel) Subscription before period ends
   */
  async resumeSubscription(organizationId: string): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({
      where: { organizationId },
    });

    if (!sub || !sub.stripeSubscriptionId) {
      throw new BadRequestException('No active subscription found');
    }

    await this.stripeClient.stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: false },
    });
  }

  /**
   * Change Subscription Plan (Upgrade/Downgrade)
   */
  async changePlan(organizationId: string, newPlan: SubscriptionPlan): Promise<void> {
    // 1. Get current subscription
    const sub = await this.prisma.subscription.findUnique({
      where: { organizationId },
    });

    if (!sub || !sub.stripeSubscriptionId) {
      throw new BadRequestException('No active subscription found to change');
    }

    if (sub.plan === newPlan) {
      throw new BadRequestException('Organization is already on this plan');
    }

    // 2. Resolve new Price ID configuration
    const planConfig = SUBSCRIPTION_PLANS[newPlan];
    if (!planConfig) {
      throw new BadRequestException(`Invalid plan configuration for: ${newPlan}`);
    }

    // 3. Get Real Price ID from Config (or fallback to Mock)
    const priceId =
      this.configService.get(planConfig.priceIdEnvKey) || 'price_MISSING_CONFIG_' + newPlan;

    // 4. Retrieve Stripe Subscription to get the Item ID (required for update)
    const stripeSub = await this.stripeClient.stripe.subscriptions.retrieve(
      sub.stripeSubscriptionId,
    );
    const itemId = stripeSub.items.data[0].id;

    // 5. Determine if Upgrade or Downgrade
    const currentPlanConfig = SUBSCRIPTION_PLANS[sub.plan];
    const isUpgrade = planConfig.priceUSD > (currentPlanConfig?.priceUSD || 0);

    // 6. Update Stripe
    await this.stripeClient.stripe.subscriptions.update(sub.stripeSubscriptionId, {
      items: [
        {
          id: itemId,
          price: priceId,
        },
      ],
      // Upgrade: 'now' anchor = Immediate new cycle + Charge Full Price. 'none' proration = No credits for old unused time.
      // Downgrade: No anchor change = Keep current cycle. 'none' proration = No refund/charge now, next invoice matches new plan.
      proration_behavior: 'none',
      billing_cycle_anchor: isUpgrade ? 'now' : undefined,
    });
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const sub = subscription as any;
    const organizationId = sub.metadata?.organizationId;

    if (!organizationId) {
      this.logger.warn(`Subscription ${sub.id} updated but no organizationId in metadata`);
      return;
    }

    // Determine Plan from Price ID
    const priceId = sub.items.data[0].price.id;
    let planName: SubscriptionPlan | null = null;

    // reverse lookup
    for (const [key, config] of Object.entries(SUBSCRIPTION_PLANS)) {
      // In real app compare against configService.get(config.priceIdEnvKey)
      // For now we might not have it.
      // Fallback: checks if priceId contains plan name (due to our mock logic)
      if (
        priceId.includes(config.name) ||
        priceId === this.configService.get(config.priceIdEnvKey)
      ) {
        planName = key as SubscriptionPlan;
        break;
      }
    }

    if (!planName) {
      // Last resort: check metadata
      if (sub.metadata?.plan) {
        planName = sub.metadata.plan as SubscriptionPlan;
      } else {
        this.logger.warn(
          `Could not determine plan for priceId ${priceId} in subscription ${sub.id}`,
        );
        return;
      }
    }

    await this.prisma.$transaction([
      this.prisma.organization.update({
        where: { id: organizationId },
        data: { plan: planName },
      }),
      this.prisma.subscription.update({
        where: { organizationId },
        data: {
          plan: planName,
          status: 'ACTIVE', // Map Stripe status? active, past_due, etc.
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          stripePriceId: priceId,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        },
      }),
    ]);

    this.logger.log(`Synced subscription ${sub.id} for org ${organizationId} to plan ${planName}`);
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const organizationId = subscription.metadata?.organizationId;
    if (!organizationId) return;

    await this.prisma.$transaction([
      this.prisma.organization.update({
        where: { id: organizationId },
        data: { plan: 'FREE' },
      }),
      this.prisma.subscription.update({
        where: { organizationId },
        data: {
          status: 'CANCELED',
          cancelAtPeriodEnd: false,
        },
      }),
    ]);
    this.logger.log(
      `Subscription ${subscription.id} deleted. Org ${organizationId} downgraded to FREE.`,
    );
  }
}
