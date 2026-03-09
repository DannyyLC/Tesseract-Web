import { Injectable, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import { StripeClient } from './stripe.client';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { CreditsService } from '../credits/credits.service';
import { TransactionType, SubscriptionPlan } from '@prisma/client';
import { PLANS, getPlanLimits, SubscriptionPlan as SharedSubscriptionPlan } from '@tesseract/types';
import { ConfigService } from '@nestjs/config';
import { SUBSCRIPTION_PLANS } from './billing.constants';
import { PrismaService } from '../database/prisma.service';
import { BillingDashboardDto } from './dto/billing-dashboard.dto';
import Stripe from 'stripe';

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
   * Create Stripe Customer Portal Session
   */
  async createCustomerPortalSession(customerId: string, returnUrl: string): Promise<string> {
    const session = await this.stripeClient.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return session.url;
  }

  /**
   * Handle Stripe Webhook Events
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'invoice.created':
        await this.handleInvoiceCreated(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;
      default:
        this.logger.log(`Unhandled event type ${event.type}`);
    }
  }

  // ============================================
  // Stripe API Compatibility Helpers
  // The Stripe API restructured Invoice objects:
  //   - subscription → parent.subscription_details.subscription
  //   - subscription_details.metadata → parent.subscription_details.metadata
  //   - line.price.id → line.pricing.price_details.price
  // ============================================
  private getInvoiceSubscriptionId(invoice: any): string | undefined {
    // New API: parent.subscription_details.subscription
    // Old API: invoice.subscription (string or object)
    return (
      invoice.parent?.subscription_details?.subscription ??
      (typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription?.id)
    );
  }

  private getInvoiceOrganizationId(invoice: any): string | undefined {
    // New API: parent.subscription_details.metadata
    // Old API: subscription_details.metadata or invoice.metadata
    return (
      invoice.parent?.subscription_details?.metadata?.organizationId ??
      invoice.subscription_details?.metadata?.organizationId ??
      invoice.metadata?.organizationId
    );
  }

  private getLineItemPriceId(lineItem: any): string | undefined {
    // New API: pricing.price_details.price
    // Old API: price.id
    return (
      lineItem.pricing?.price_details?.price ??
      lineItem.price?.id
    );
  }

  /**
   * Handle Invoice Created
   * SNAPSHOT LOGIC: Check for negative balance and bill it immediately
   */
  private async handleInvoiceCreated(invoiceObject: Stripe.Invoice) {
    const invoice = invoiceObject as any;

    const subscriptionId = this.getInvoiceSubscriptionId(invoice);

    // Only process subscription invoices
    if (subscriptionId && invoice.billing_reason === 'subscription_cycle') {
      const organizationId = this.getInvoiceOrganizationId(invoice);

      if (!organizationId) {
        this.logger.warn(`Invoice ${invoice.id} created but no organizationId found`);
        return;
      }

      // 1. Check Credit Balance
      const creditBalance = await this.prisma.creditBalance.findUnique({
        where: { organizationId },
      });

      if (!creditBalance) return;

      // 2. If negative balance, create Invoice Item for Overage
      if (creditBalance.balance < 0) {
        const overageCredits = Math.abs(creditBalance.balance);

        // Use Stripe Product Price for Overage
        const overagePriceId = this.configService.get('STRIPE_PRICE_OVERAGE');

        if (!overagePriceId) {
          this.logger.error('STRIPE_PRICE_OVERAGE not configured in environment');
          return;
        }

        if (overageCredits > 0) {
          this.logger.log(
            `Org ${organizationId} has ${overageCredits} negative credits. Adding invoice item via Price ID ${overagePriceId}`,
          );

          // Add Invoice Item to THIS invoice using Price ID
          await this.stripeClient.stripe.invoiceItems.create({
            customer: invoice.customer as string,
            invoice: invoice.id,
            price: overagePriceId,
            quantity: overageCredits,
          } as any);

          // 3. Mark as "Invoiced" in DB (Snapshot)
          await this.prisma.creditBalance.update({
            where: { organizationId },
            data: {
              invoicedOverageCredits: overageCredits,
            },
          });
        }
      }
    }
  }

  /**
   * Handle Invoice Payment Failed
   * Logic: Treat as "Soft Cancellation" - limit risk but allow recovery
   */
  private async handleInvoicePaymentFailed(invoiceObject: Stripe.Invoice) {
    const invoice = invoiceObject as any;
    const organizationId = this.getInvoiceOrganizationId(invoice);

    if (!organizationId) {
      this.logger.warn(`Invoice ${invoice.id} payment failed but no organizationId found`);
      return;
    }

    this.logger.warn(
      `Invoice ${invoice.id} payment failed for Org ${organizationId}. Revoking access.`,
    );

    // 1. Disable Overages Immediately
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { allowOverages: false },
    });

    // 2. Mark Subscription as benign "canceled at end" to prevent infinite renewal attempts
    // Or relies on Stripe's "Smart Retries".
    const subId = this.getInvoiceSubscriptionId(invoice);
    if (subId) {
      // Verify it exists in our DB
      const sub = await this.prisma.subscription.findUnique({ where: { organizationId } });
      if (sub) {
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: {
            status: 'PAST_DUE', // Internal status to show in UI
            // We don't necessarily set cancelAtPeriodEnd=true here because we want them to PAY.
            // But we blocked overages.
          },
        });
      }
    }
  }

  private async handleInvoicePaymentSucceeded(invoiceObject: Stripe.Invoice) {
    const invoice = invoiceObject as any; // Cast to any to handle type mismatches

    const subscriptionId = this.getInvoiceSubscriptionId(invoice);

    if (!subscriptionId) {
      this.logger.warn(
        `Invoice ${invoice.id} has no subscription attached, skipping credit addition`,
      );
      return;
    }

    // Skip $0 invoices (e.g. trial starts, free invoices)
    if (!invoice.amount_paid || invoice.amount_paid === 0) {
      this.logger.log(`Invoice ${invoice.id} has $0 amount paid, skipping credit addition`);
      return;
    }

    // Use organizationId from invoice metadata or subscription metadata
    let organizationId = this.getInvoiceOrganizationId(invoice);

    // Fallback: Retrieve organizationId from the Stripe subscription metadata directly
    if (!organizationId) {
      this.logger.warn(
        `Invoice ${invoice.id} missing organizationId in invoice metadata, looking up from Stripe subscription ${subscriptionId}`,
      );
      try {
        const stripeSub = await this.stripeClient.stripe.subscriptions.retrieve(subscriptionId);
        organizationId = stripeSub.metadata?.organizationId;
      } catch (err) {
        this.logger.error(`Failed to retrieve subscription ${subscriptionId} from Stripe`, err);
      }
    }

    // Last resort: Look up from our DB
    if (!organizationId) {
      this.logger.warn(
        `Still no organizationId for invoice ${invoice.id}, looking up from DB by stripeSubscriptionId ${subscriptionId}`,
      );
      const dbSub = await this.prisma.subscription.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
      });
      organizationId = dbSub?.organizationId;
    }

    if (!organizationId) {
      this.logger.error(`No organizationId found for invoice ${invoice.id} after all fallbacks`);
      return;
    }

    this.logger.log(`Processing invoice ${invoice.id} for org ${organizationId} (sub: ${subscriptionId})`);

    const amountPaidCents = invoice.amount_paid;

    // Find Plan based on Price ID or Amount
    let creditsToAdd = 0;
    let planName = 'UNKNOWN';

    // 1. Prioritize looking up by Price ID from line items
    let priceId: string | undefined;

    for (const line of invoice.lines?.data ?? []) {
      const linePriceId = this.getLineItemPriceId(line);
      if (!linePriceId) continue;

      const planByPriceId = Object.values(SUBSCRIPTION_PLANS).find(
        (p: any) => this.configService.get(p.priceIdEnvKey) === linePriceId,
      );

      if (planByPriceId) {
        creditsToAdd = planByPriceId.limits.monthlyCredits;
        planName = planByPriceId.type;
        priceId = linePriceId;
        this.logger.log(`Matched invoice line to plan ${planName} via priceId ${linePriceId}`);
        break; // Found the subscription plan
      }
    }

    // 2. Fallback to amount if price ID match failed or wasn't available
    if (creditsToAdd === 0 && amountPaidCents > 0) {
      const planByAmount = Object.values(SUBSCRIPTION_PLANS).find(
        (p: any) => p.price.monthly * 100 === amountPaidCents,
      );

      if (planByAmount) {
        creditsToAdd = planByAmount.limits.monthlyCredits;
        planName = planByAmount.type;
        this.logger.log(`Matched invoice to plan ${planName} via amount ${amountPaidCents}`);
      }
    }

    // 3. Fallback for custom/Enterprise plans that don't match standard Price IDs and standard amounts
    if (creditsToAdd === 0) {
      const existingSub = await this.prisma.subscription.findUnique({
        where: { organizationId },
      });

      if (existingSub?.plan === 'ENTERPRISE') {
        // Use custom monthly credits if defined, otherwise -1 (unlimited)
        creditsToAdd = existingSub.customMonthlyCredits ?? SUBSCRIPTION_PLANS.ENTERPRISE.limits.monthlyCredits;
        planName = 'ENTERPRISE';
        this.logger.log(`Using custom ENTERPRISE plan limits for Org ${organizationId}`);
      }
    }



    if (creditsToAdd === 0) {
      this.logger.warn(
        `Invoice ${invoice.id} (Amount: ${amountPaidCents}, Price ID: ${priceId}) does not match any standard plan price. No credits added.`,
      );
    }

    if (creditsToAdd > 0) {
      // RECONCILIATION LOGIC

      const creditBalance = await this.prisma.creditBalance.findUnique({
        where: { organizationId },
      });
      const invoicedOverage = creditBalance?.invoicedOverageCredits ?? 0;

      // 1. Calculate strictly adds
      // Actually, we first "pay back" the invoiced amount effectively.
      // Logic:
      // Current Balance: -110
      // Invoiced: 100 (We just got paid for this)
      // Credits To Add: 1000 (New Plan)

      // Temporary Balance after payment = -110 + 100 = -10.
      // Gap = -10.

      const currentBalance = creditBalance?.balance ?? 0;
      const balanceAfterPayment = currentBalance + invoicedOverage;

      let gapCredits = 0;
      if (balanceAfterPayment < 0) {
        gapCredits = Math.abs(balanceAfterPayment);
      }

      // If there is a gap, we bill it for NEXT month
      if (gapCredits > 0) {
        const overagePriceId = this.configService.get('STRIPE_PRICE_OVERAGE');

        if (overagePriceId) {
          this.logger.log(
            `Org ${organizationId} has gap of ${gapCredits} credits. Billing for next month via Price ID.`,
          );

          await this.stripeClient.stripe.invoiceItems.create({
            customer: invoice.customer as string,
            price: overagePriceId,
            quantity: gapCredits,
            description: `Overage Adjustment (Prev Month: ${gapCredits} credits)`,
          } as any);
        } else {
          this.logger.error('STRIPE_PRICE_OVERAGE missing during reconciliation gap billing');
        }
      }

      // SYNC DB STATE

      // 1. Update Organization Plan
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: { plan: planName as SubscriptionPlan },
      });

      // 2. Upsert Subscription
      const periodStart = invoice.period_start ? new Date(invoice.period_start * 1000) : new Date();
      const periodEnd = invoice.period_end ? new Date(invoice.period_end * 1000) : new Date();
      const upsertPriceId = this.getLineItemPriceId(invoice.lines?.data?.[0]);

      await this.prisma.subscription.upsert({
        where: { organizationId },
        create: {
          organizationId,
          plan: planName as SubscriptionPlan,
          status: 'ACTIVE',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          stripeSubscriptionId: subscriptionId,
          stripePriceId: upsertPriceId,
        },
        update: {
          plan: planName as SubscriptionPlan,
          status: 'ACTIVE',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          stripeSubscriptionId: subscriptionId,
          stripePriceId: upsertPriceId,
          pendingPlanChange: null,
        },
      });

      // 3. Update Balance
      // Logic: We want user to start with `creditsToAdd`.
      // Formula: NewBalance = creditsToAdd.
      // Why? Because we billed the gap. So effectively we cleared the debt.
      // Wait, if we use `creditsService.addCredits`, it adds to existing balance.
      // Existing: -110.
      // We want result: 1000.
      // So we need to add: 1110.
      // Breakdown: 100 (Payback Invoiced) + 10 (Payback Gap) + 1000 (New).

      const correctionAmount = invoicedOverage + gapCredits;
      const totalGrant = creditsToAdd + correctionAmount;

      // We record the transaction
      await this.creditsService.addCredits(
        organizationId,
        totalGrant,
        TransactionType.SUBSCRIPTION_RENEWAL,
        `Plan ${planName} Payment + Overage Reconciliation`,
        {
          stripeInvoiceId: invoice.id,
          plan: planName,
          invoicedOverage,
          gapCredits,
          stripeLineItems:
            invoice.lines?.data?.map((l: any) => ({
              description: l.description,
              amountUSD: l.amount / 100,
              quantity: l.quantity,
            })) ?? [],
        },
        amountPaidCents / 100,
        subscriptionId,
        undefined, // invoiceId: Stripe ID is already stored in metadata.stripeInvoiceId
      );

      // Reset InvoicedOverageCredits
      await this.prisma.creditBalance.update({
        where: { organizationId },
        data: { invoicedOverageCredits: 0 },
      });

      this.logger.log(
        `Processed renewal for org ${organizationId}. Plan: ${creditsToAdd}. Overage Paid: ${invoicedOverage}. Gap Billed: ${gapCredits}.`,
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

    if (!sub?.stripeSubscriptionId) {
      throw new BadRequestException('No active subscription found');
    }

    await this.stripeClient.stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: true },
    });

    // Disable Overages Immediately to prevent risk
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { allowOverages: false },
    });
  }

  /**
   * Resume (Un-cancel) Subscription before period ends
   */
  async resumeSubscription(organizationId: string): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({
      where: { organizationId },
    });

    if (!sub?.stripeSubscriptionId) {
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
    if (newPlan === 'FREE') {
      throw new BadRequestException('Cannot change to FREE plan directly. Please cancel your subscription instead.');
    }

    // 1. Get current subscription
    const sub = await this.prisma.subscription.findUnique({
      where: { organizationId },
    });

    if (!sub?.stripeSubscriptionId) {
      throw new BadRequestException('No active subscription found to change');
    }

    if (sub.status === 'CANCELED') {
      throw new BadRequestException('Cannot change a canceled subscription. Please create a new subscription instead.');
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
      this.configService.get(planConfig.priceIdEnvKey) ?? 'price_MISSING_CONFIG_' + newPlan;

    // 4. Retrieve Stripe Subscription to get the Item ID (required for update)
    const stripeSub = await this.stripeClient.stripe.subscriptions.retrieve(
      sub.stripeSubscriptionId,
    );

    // Guard: Verify subscription is not canceled in Stripe (DB may be out of sync)
    if (stripeSub.status === 'canceled') {
      this.logger.warn(
        `Subscription ${sub.stripeSubscriptionId} is canceled in Stripe but DB shows ${sub.status}. Syncing DB.`,
      );
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'CANCELED' },
      });
      throw new ConflictException(
        'SUBSCRIPTION_CANCELED_IN_STRIPE',
      );
    }

    const itemId = stripeSub.items.data[0].id;

    // 5. Determine if Upgrade or Downgrade
    const currentPlanConfig = SUBSCRIPTION_PLANS[sub.plan];
    const isUpgrade = planConfig.price.monthly > (currentPlanConfig?.price.monthly ?? 0);

    if (isUpgrade) {
      // UPGRADE: Immediate change + Charge difference now
      await this.stripeClient.stripe.subscriptions.update(sub.stripeSubscriptionId, {
        items: [
          {
            id: itemId,
            price: priceId,
          },
        ],
        proration_behavior: 'none', // Charge full new plan immediately, no refund for old
        billing_cycle_anchor: 'now', // Reset cycle to now (optional, usually preferred for upgrades)
      });
      // DB update will happen via webhook 'customer.subscription.updated'
    } else {
      // DOWNGRADE: Schedule change for end of period
      // We use Subscription Schedules to queue the change natively in Stripe

      // 1. Check if a schedule already exists
      const subscriptions = (await this.stripeClient.stripe.subscriptions.retrieve(
        sub.stripeSubscriptionId,
      )) as any;

      const scheduleId = subscriptions.schedule as string;

      if (scheduleId) {
        // Update existing schedule
        await this.stripeClient.stripe.subscriptionSchedules.update(scheduleId, {
          phases: [
            {
              start_date: subscriptions.current_period_start, // Must match existing phase start
              end_date: subscriptions.current_period_end,
              items: [{ price: subscriptions.items.data[0].price.id }],
            },
            {
              start_date: subscriptions.current_period_end,
              items: [{ price: priceId }],
            },
          ],
        });
      } else {
        // Create new schedule from current subscription
        const schedule = await this.stripeClient.stripe.subscriptionSchedules.create({
          from_subscription: sub.stripeSubscriptionId,
        });

        // Add the downgrade phase
        await this.stripeClient.stripe.subscriptionSchedules.update(schedule.id, {
          phases: [
            {
              start_date: subscriptions.current_period_start, // Must match existing phase start
              end_date: subscriptions.current_period_end,
              items: [{ price: subscriptions.items.data[0].price.id }],
            },
            {
              start_date: subscriptions.current_period_end,
              items: [{ price: priceId }],
            },
          ],
        });
      }

      // 2. Update DB to reflect pending change
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          pendingPlanChange: newPlan,
          planChangeRequestedAt: new Date(),
          cancelAtPeriodEnd: false, // Ensure we don't cancel since we are just moving to lower plan
        },
      });

      this.logger.log(`Scheduled downgrade to ${newPlan} for org ${organizationId}`);
    }
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
      this.prisma.subscription.upsert({
        where: { organizationId },
        create: {
          organizationId,
          plan: planName,
          status: 'ACTIVE',
          currentPeriodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000) : new Date(),
          currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : new Date(),
          stripeSubscriptionId: sub.id,
          stripePriceId: priceId,
        },
        update: {
          plan: planName,
          status: 'ACTIVE',
          currentPeriodStart: sub.current_period_start ? new Date(sub.current_period_start * 1000) : new Date(),
          currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : new Date(),
          stripeSubscriptionId: sub.id,
          stripePriceId: priceId,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          pendingPlanChange: null, // Clear flags now that update is applied
          planChangeRequestedAt: null,
        },
      }),
    ]);

    this.logger.log(`Synced subscription ${sub.id} for org ${organizationId} to plan ${planName}`);

    // RISK PREVENTION: Disable overages if subscription is being cancelled
    if (sub.cancel_at_period_end) {
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: { allowOverages: false },
      });
      this.logger.log(`Disabled overages for org ${organizationId} (cancel_at_period_end detected via webhook)`);
    }

    // CLEANUP: Cancel any other active subscriptions for this customer (prevent duplicates)
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    if (customerId) {
      const activeSubscriptions = await this.stripeClient.stripe.subscriptions.list({
        customer: customerId,
        status: 'active',
      });

      for (const activeSub of activeSubscriptions.data) {
        if (activeSub.id !== sub.id) {
          this.logger.warn(
            `Canceling duplicate subscription ${activeSub.id} for org ${organizationId} (keeping ${sub.id})`,
          );
          await this.stripeClient.stripe.subscriptions.cancel(activeSub.id);
        }
      }
    }

    // ENFORCE PLAN LIMITS (Downgrade Logic)
    await this.enforceLimits(organizationId, planName);
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const organizationId = subscription.metadata?.organizationId;
    if (!organizationId) return;

    // Guard: Only process if this is the subscription we're currently tracking
    // Ignore deletions of orphaned/duplicate subscriptions (e.g. from cleanup)
    const trackedSub = await this.prisma.subscription.findUnique({
      where: { organizationId },
    });

    if (trackedSub?.stripeSubscriptionId && trackedSub.stripeSubscriptionId !== subscription.id) {
      this.logger.log(
        `Ignoring deletion of orphaned subscription ${subscription.id} for org ${organizationId} (tracking ${trackedSub.stripeSubscriptionId})`,
      );
      return;
    }

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

    // ENFORCE PLAN LIMITS (Downgrade to FREE)
    await this.enforceLimits(organizationId, 'FREE');
  }

  /**
   * Enforce Resource Limits based on Plan
   * Deactivates excess Workflows, API Keys, and Users.
   */
  private async enforceLimits(organizationId: string, newPlan: SubscriptionPlan) {
    this.logger.log(`Enforcing limits for org ${organizationId} on plan ${newPlan}`);

    // DETERMINE EFFECTIVE LIMITS
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        customMaxUsers: true,
        customMaxWorkflows: true,
        customMaxApiKeys: true,
      },
    });

    if (!organization) return;

    const defaultLimits = PLANS[newPlan];

    // Disable Overages if downgrading to FREE
    if (newPlan === 'FREE') {
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: { allowOverages: false },
      });
      this.logger.log(`Disabled overages for org ${organizationId} (FREE plan)`);
    }

    const maxWorkflows = organization.customMaxWorkflows ?? defaultLimits.limits?.maxWorkflows;
    const maxApiKeys = organization.customMaxApiKeys ?? defaultLimits.limits?.maxApiKeys;
    const maxUsers = organization.customMaxUsers ?? defaultLimits.limits?.maxUsers;

    // ENFORCE WORKFLOW LIMITS
    if (maxWorkflows !== -1) {
      const activeWorkflows = await this.prisma.workflow.findMany({
        where: {
          organizationId,
          isActive: true,
          deletedAt: null,
        },
        select: {
          id: true,
          _count: {
            select: { executions: true },
          },
        },
      });

      // Sort by executions (DESC)
      activeWorkflows.sort((a: any, b: any) => b._count.executions - a._count.executions);

      if (activeWorkflows.length > maxWorkflows) {
        const workflowsToDeactivate = activeWorkflows.slice(maxWorkflows);

        const idsToDeactivate = workflowsToDeactivate.map((w: any) => w.id);

        if (idsToDeactivate.length > 0) {
          await this.prisma.workflow.updateMany({
            where: { id: { in: idsToDeactivate } },
            data: { isActive: false },
          });
          this.logger.log(`Deactivated ${idsToDeactivate.length} excess workflows.`);
        }
      }
    }

    // ENFORCE API KEY LIMITS
    if (maxApiKeys !== -1) {
      const currentlyActiveWorkflows = await this.prisma.workflow.findMany({
        where: { organizationId, isActive: true, deletedAt: null },
        select: { id: true },
      });
      const activeWorkflowIds = currentlyActiveWorkflows.map((w) => w.id);

      // Fetch all active API keys
      const activeApiKeys = await this.prisma.apiKey.findMany({
        where: {
          organizationId,
          isActive: true,
          deletedAt: null,
        },
        select: {
          id: true,
          workflowId: true,
          _count: {
            select: { executions: true },
          },
        },
      });

      // Filter: Only keep keys for currently active workflows
      const validApiKeys = activeApiKeys.filter((k: any) =>
        activeWorkflowIds.includes(k.workflowId),
      );
      const invalidApiKeys = activeApiKeys.filter(
        (k: any) => !activeWorkflowIds.includes(k.workflowId),
      );

      // Sort valid keys by executions (DESC)
      validApiKeys.sort((a: any, b: any) => b._count.executions - a._count.executions);

      // Determine which to keep from the valid ones
      const keysToDeactivateFromValid = validApiKeys.slice(maxApiKeys);

      // Collect all IDs to deactivate
      const idsToDeactivate = [
        ...invalidApiKeys.map((k: any) => k.id),
        ...keysToDeactivateFromValid.map((k: any) => k.id),
      ];

      if (idsToDeactivate.length > 0) {
        await this.prisma.apiKey.updateMany({
          where: { id: { in: idsToDeactivate } },
          data: { isActive: false },
        });
        this.logger.log(`Deactivated ${idsToDeactivate.length} excess API keys.`);
      }
    }

    // ENFORCE USER LIMITS
    if (maxUsers !== -1) {
      const activeUsers = await this.prisma.user.findMany({
        where: {
          organizationId,
          isActive: true,
          deletedAt: null,
        },
        select: {
          id: true,
          role: true,
          lastLoginAt: true,
        },
      });

      if (activeUsers.length > maxUsers) {
        const usersToKeep: string[] = [];
        let slotsRemaining = maxUsers;

        // Always keep OWNER
        const owners = activeUsers.filter((u: any) => u.role === 'owner');
        owners.forEach((u: any) => usersToKeep.push(u.id));
        slotsRemaining -= owners.length;

        if (owners.length > 1) {
          this.logger.warn(`Organization ${organizationId} has multiple owners! Keeping all.`);
        }

        // Keep ADMINs (sorted by recent login)
        if (slotsRemaining > 0) {
          const admins = activeUsers.filter((u: any) => u.role === 'admin');
          admins.sort((a: any, b: any) => {
            const timeA = a.lastLoginAt ? a.lastLoginAt.getTime() : 0;
            const timeB = b.lastLoginAt ? b.lastLoginAt.getTime() : 0;
            return timeB - timeA;
          });

          const adminsToKeep = admins.slice(0, slotsRemaining);
          adminsToKeep.forEach((u: any) => usersToKeep.push(u.id));
          slotsRemaining -= adminsToKeep.length;
        }

        // Keep VIEWERS (sorted by recent login)
        if (slotsRemaining > 0) {
          const viewers = activeUsers.filter((u: any) => u.role === 'viewer');
          viewers.sort((a: any, b: any) => {
            const timeA = a.lastLoginAt ? a.lastLoginAt.getTime() : 0;
            const timeB = b.lastLoginAt ? b.lastLoginAt.getTime() : 0;
            return timeB - timeA; // Descending
          });
          const viewersToKeep = viewers.slice(0, slotsRemaining);
          viewersToKeep.forEach((u: any) => usersToKeep.push(u.id));
          slotsRemaining -= viewersToKeep.length;
        }

        const usersToDeactivate = activeUsers.filter((u: any) => !usersToKeep.includes(u.id));

        if (usersToDeactivate.length > 0) {
          await this.prisma.user.updateMany({
            where: { id: { in: usersToDeactivate.map((u: any) => u.id) } },
            data: { isActive: false },
          });
          this.logger.log(`Deactivated ${usersToDeactivate.length} excess users.`);
        }
      }
    }
  }

  /**
   * Get Aggregated Billing Dashboard Data
   */
  async getBillingDashboard(organizationId: string): Promise<BillingDashboardDto> {
    const [organization, subscription, creditBalance, workflowCount, apiKeyCount, userCount] =
      await this.prisma.$transaction([
        this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: { plan: true, allowOverages: true, overageLimit: true, stripeCustomerId: true },
        }),
        this.prisma.subscription.findUnique({
          where: { organizationId },
        }),
        this.prisma.creditBalance.findUnique({
          where: { organizationId },
        }),
        // Resource Counts
        this.prisma.workflow.count({
          where: {
            organizationId,
            isActive: true,
            deletedAt: null,
          },
        }),
        this.prisma.apiKey.count({
          where: {
            organizationId,
            isActive: true,
            deletedAt: null,
          },
        }),
        this.prisma.user.count({
          where: {
            organizationId,
            isActive: true,
            deletedAt: null,
          },
        }),
      ]);

    if (!organization) throw new BadRequestException('Organization not found');

    // Get effective limits (including custom Enterprise overrides)
    // Map subscription fields to EnterprisePlanConfig if needed
    const enterpriseConfig = subscription
      ? {
          customMonthlyPrice: subscription.customMonthlyPrice ?? undefined,
          customMonthlyCredits: subscription.customMonthlyCredits ?? undefined,
          customMaxWorkflows: subscription.customMaxWorkflows ?? undefined,
          customOverageLimit: subscription.customOverageLimit ?? undefined,
        }
      : undefined;

    const limits = getPlanLimits(
      organization.plan as unknown as SharedSubscriptionPlan,
      enterpriseConfig,
    );

    return {
      plan: organization.plan,
      status: subscription?.status ?? 'ACTIVE',
      nextBillingDate: subscription?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      allowOverages: organization.allowOverages,
      overageLimit: organization.overageLimit ?? 0,
      hasBillingAccount: !!organization.stripeCustomerId,
      credits: {
        available: creditBalance?.balance ?? 0,
        usedThisMonth: creditBalance?.currentMonthSpent ?? 0,
        limit: limits.monthlyCredits,
      },
      usage: {
        workflows: {
          used: workflowCount,
          limit: limits.maxWorkflows,
        },
        apiKeys: {
          used: apiKeyCount,
          limit: limits.maxApiKeys,
        },
        users: {
          used: userCount,
          limit: limits.maxUsers,
        },
      },
    };
  }
}
