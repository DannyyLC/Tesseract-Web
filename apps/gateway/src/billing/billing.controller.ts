import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Headers,
  BadRequestException,
  Req,
  UseGuards,
  Delete,
  Put,
  Res,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Stripe } from 'stripe';
import { PrismaService } from '../database/prisma.service';
import { Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionPlan } from '@prisma/client';
import { SUBSCRIPTION_PLANS } from './billing.constants';
import { StripeClient } from './stripe.client';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { BillingDashboardDto } from './dto/billing-dashboard.dto';
import { OrganizationsService } from '../organizations/organizations.service';
import { ApiResponseBuilder, UserRole } from '@tesseract/types';
import { Organization } from '@tesseract/database';
import { UserPayload } from '../common/types/jwt-payload.type';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Response } from 'express';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly stripeClient: StripeClient,
    private readonly organizationsService: OrganizationsService,
  ) {}
  private readonly logger = new Logger(BillingController.name);

  @Post('checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async createCheckoutSession(
    @Req() req: Request & { user: UserPayload },
    @Body() body: { plan: string },
  ) {
    const organizationId = req.user.organizationId;
    const userEmail = req.user.email;
    const userName = req.user.name ?? 'Admin User';

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
        name: organization.name ?? userName,
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
    const frontendUrl = this.configService.get('FRONTEND_URL') ?? 'http://localhost:3000';

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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async createPortalSession(@Req() req: Request & { user: UserPayload }) {
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

    const frontendUrl = this.configService.get('FRONTEND_URL') ?? 'http://localhost:3000';
    const returnUrl = `${frontendUrl}/billing`;

    const url = await this.billingService.createCustomerPortalSession(
      organization.stripeCustomerId,
      returnUrl,
    );

    return { url };
  }

  @Get('plans')
  getPlans() {
    return Object.values(SUBSCRIPTION_PLANS).map(({ priceIdEnvKey: _priceIdEnvKey, ...plan }) => plan);
  }

  @Get('subscription')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async getSubscription(@Req() req: Request & { user: UserPayload }) {
    const organizationId = req.user.organizationId;

    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
      select: {
        plan: true,
        status: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        pendingPlanChange: true,
        planChangeRequestedAt: true,
        customMonthlyPrice: true,
        customMonthlyCredits: true,
        customMaxWorkflows: true,
        customFeatures: true,
      },
    });

    return (
      subscription ?? {
        status: 'ACTIVE',
        plan: 'FREE',
        currentPeriodStart: null,
        currentPeriodEnd: null,
      }
    );
  }

  @Put('subscription')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async updateSubscription(
    @Req() req: Request & { user: UserPayload },
    @Body() body: UpdateSubscriptionDto,
  ) {
    const organizationId = req.user.organizationId;
    if (!organizationId) {
      throw new BadRequestException('User does not belong to an organization');
    }

    // Validate Plan exists
    if (!SUBSCRIPTION_PLANS[body.plan]) {
      throw new BadRequestException(`Invalid plan: ${body.plan}`);
    }

    await this.billingService.changePlan(organizationId, body.plan);
    return { message: 'Plan update initiated successfully' };
  }

  @Get('dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async getDashboardData(@Req() req: Request & { user: UserPayload }): Promise<BillingDashboardDto> {
    const organizationId = req.user.organizationId;
    if (!organizationId) {
      throw new BadRequestException('User does not belong to an organization');
    }
    return this.billingService.getBillingDashboard(organizationId);
  }

  @Delete('subscription')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async cancelSubscription(@Req() req: Request & { user: UserPayload }) {
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
    let event: Stripe.Event;
    try {
      const rawBody = (request as unknown as { rawBody: string }).rawBody;
      if (!rawBody) {
        throw new Error('Raw body not available. Ensure `rawBody: true` is set in main.ts');
      }
      event = this.stripeClient.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: unknown) {
      if (err instanceof Error) {
        this.logger.error(`Webhook Signature Verification Failed: ${err.message}`);
        throw new BadRequestException(`Webhook Error: ${err.message}`);
      }
      throw new BadRequestException(`Webhook Error: Unknown error`);
    }

    try {
      await this.billingService.handleWebhookEvent(event);
    } catch (err: unknown) {
      if (err instanceof Error) {
        throw new BadRequestException(`Webhook Processing Error: ${err.message}`);
      }
      throw new BadRequestException(`Webhook Processing Error: Unknown error`);
    }

    return { received: true };
  }

  @Patch('overages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async toggleOverages(
    @CurrentUser() user: UserPayload,
    @Body() body: { allowOverages: boolean; overageLimit?: number },
    @Res() res: Response,
  ): Promise<Response> {
    const apiResponse = new ApiResponseBuilder<Organization>();
    const result = await this.organizationsService.toggleOverages(
      user.organizationId,
      body.allowOverages,
      body.overageLimit,
    );

    if (!result) {
      apiResponse.setStatusCode(400).setMessage('Failed to update overages setting');
      return res.status(400).json(apiResponse.build());
    }

    apiResponse
      .setStatusCode(200)
      .setMessage('Overages setting updated successfully')
      .setData(result);
    return res.status(200).json(apiResponse.build());
  }
}
