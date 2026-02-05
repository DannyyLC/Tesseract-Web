import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  BadRequestException,
  Req,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../database/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionPlan } from '@prisma/client';
import { SUBSCRIPTION_PLANS } from './billing.constants';
import { StripeClient } from './stripe.client';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly stripeClient: StripeClient,
  ) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  async createCheckoutSession(@Req() req: any, @Body() body: { plan: string | SubscriptionPlan }) {
    const organizationId = req.user.organizationId;
    const userEmail = req.user.email;
    const userName = req.user.name || 'Admin User';

    if (!organizationId) {
      throw new BadRequestException('User does not belong to an organization');
    }

    const planName = body.plan as SubscriptionPlan;
    if (!SUBSCRIPTION_PLANS[planName]) {
      throw new BadRequestException(`Invalid plan: ${planName}`);
    }

    // 1. Get Organization to check for existing Stripe Customer
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new BadRequestException('Organization not found');
    }

    let customerId = organization.stripeCustomerId;

    // 2. Create Stripe Customer if not exists
    if (!customerId) {
        customerId = await this.billingService.createCustomer({
          email: userEmail,
          name: organization.name || userName,
          metadata: {
            organizationId: organizationId,
          },
        });
  
        // Save to DB
        await this.prisma.organization.update({
          where: { id: organizationId },
          data: { stripeCustomerId: customerId },
        });
    }

    // 3. Resolve Price ID
    const planConfig = SUBSCRIPTION_PLANS[planName];
    const priceId = this.configService.get(planConfig.priceIdEnvKey);

    if (!priceId) {
      throw new BadRequestException(`Price ID for plan ${planName} is not configured`);
    }

    // 4. Create Checkout Session
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3000';

    const sessionUrl = await this.billingService.createCheckoutSession({
      customerId,
      priceId,
      successUrl: `${frontendUrl}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${frontendUrl}/billing?canceled=true`,
      metadata: {
        organizationId,
        plan: planName,
      },
      allowPromotionCodes: true,
    });

    return { url: sessionUrl };
  }

  @Post('portal')
  @UseGuards(JwtAuthGuard)
  async createPortalSession(@Req() req: any) {
    const organizationId = req.user.organizationId;
    if (!organizationId) {
       throw new BadRequestException('User does not belong to an organization');
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization?.stripeCustomerId) {
       throw new BadRequestException('Organization has no billing account');
    }

    const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3000';
    const returnUrl = `${frontendUrl}/billing`;

    const url = await this.billingService.createCustomerPortalSession(
      organization.stripeCustomerId,
      returnUrl
    );

    return { url };
  }

  @Get('plans')
  getPlans() {
    return Object.values(SUBSCRIPTION_PLANS).map(({ priceIdEnvKey, ...plan }) => plan);
  }

  @Get('subscription')
  @UseGuards(JwtAuthGuard)
  async getSubscription(@Req() req: any) {
    const organizationId = req.user.organizationId;
    
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
    });

    return subscription || { status: 'NO_SUBSCRIPTION', plan: 'FREE' };
  }

  @Delete('subscription')
  @UseGuards(JwtAuthGuard)
  async cancelSubscription(@Req() req: any) {
    const organizationId = req.user.organizationId;
    if (!organizationId) {
       throw new BadRequestException('User does not belong to an organization');
    }
    await this.billingService.cancelSubscription(organizationId);
    return { message: 'Subscription cancelled successfully' };
  }

  @Post('webhook')
  async handleWebhook(@Headers('stripe-signature') signature: string, @Req() request: Request) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET not configured');
    }

    // Verify signature and construct event
    let event: any;
    try {
      const rawBody = (request as any).rawBody;
      if (!rawBody) {
        throw new Error('Raw body not available. Ensure `rawBody: true` is set in main.ts');
      }
      event = this.stripeClient.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      console.error(`Webhook Signature Verification Failed: ${err.message}`);
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }

    try {
      await this.billingService.handleWebhookEvent(event);
    } catch (err: any) {
      throw new BadRequestException(`Webhook Processing Error: ${err.message}`);
    }

    return { received: true };
  }
}
