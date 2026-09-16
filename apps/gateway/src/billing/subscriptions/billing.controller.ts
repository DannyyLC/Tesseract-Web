import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Headers,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  ServiceUnavailableException,
  Req,
  UseGuards,
  Delete,
  Put,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { BillingService } from './billing.service';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Stripe } from 'stripe';
import { PrismaService } from '@/platform/database/prisma.service';
import { Logger } from '@nestjs/common';
import { JwtAuthGuard } from '@/identity/auth/guards/jwt-auth.guard';
import { StripeClient } from './stripe.client';
import { PriceCatalogService } from './price-catalog.service';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { CreateCheckoutRequestDto } from './dto/create-checkout-request.dto';
import { CreateCreditCheckoutDto } from './dto/create-credit-checkout.dto';
import { BillingDashboardDto } from './dto/billing-dashboard.dto';
import { OrganizationsService } from '@/identity/organizations/organizations.service';
import {
  ApiResponseBuilder,
  BillingPlansResponse,
  PLANS,
  SubscriptionPlan as SharedSubscriptionPlan,
  UserRole,
  resolveBillingCurrency,
  resolveSubscriptionAccess,
  isValidTopUpQuantity,
  CREDIT_TOPUP_LIMITS,
} from '@tesseract/types';
import { Organization, SubscriptionPlan, SubscriptionStatus } from '@tesseract/database';
import { UserPayload } from '@/platform/common/types/jwt-payload.type';
import { CurrentUser } from '@/identity/auth/decorators/current-user.decorator';
import { Response } from 'express';
import { RolesGuard } from '@/identity/auth/guards/roles.guard';
import { Roles } from '@/identity/auth/decorators/roles.decorator';
import { WebhookDedupService } from '@/platform/webhooks/webhook-dedup.service';
import { TwoFactorService } from '@/identity/two-factor/two-factor.service';

/** Identificador de proveedor para la tabla de deduplicación de webhooks. */
const WEBHOOK_PROVIDER_STRIPE = 'stripe';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly stripeClient: StripeClient,
    private readonly priceCatalog: PriceCatalogService,
    private readonly organizationsService: OrganizationsService,
    private readonly webhookDedup: WebhookDedupService,
    private readonly twoFactorService: TwoFactorService,
  ) {}
  private readonly logger = new Logger(BillingController.name);

  @Post('checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async createCheckoutSession(
    @Req() req: Request & { user: UserPayload },
    @Body() body: CreateCheckoutRequestDto,
  ) {
    const organizationId = req.user.organizationId;
    const userEmail = req.user.email;
    const userName = req.user.name ?? 'Admin User';

    if (!organizationId) {
      throw new BadRequestException('User does not belong to an organization');
    }

    const planName = body.plan;

    // Guard: Prevent creating a new subscription if one already exists
    const existingSub = await this.prisma.subscription.findUnique({
      where: { organizationId },
    });

    if (existingSub?.stripeSubscriptionId && existingSub.status !== SubscriptionStatus.CANCELED) {
      throw new BadRequestException(
        'You already have an active subscription. Use the plan change endpoint to switch plans.',
      );
    }

    // 1. Get Organization to check for existing Stripe Customer
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new BadRequestException('Organization not found');
    }

    // 2. Resolve the billing country.
    // El país guardado manda: Stripe congela la moneda del Customer en su primera factura, así
    // que aceptar uno distinto aquí solo serviría para que el checkout muestre pesos y el cobro
    // salga en dólares. Solo se acepta del cuerpo cuando la organización todavía no tiene.
    const country = organization.country ?? body.country;

    if (!country) {
      throw new BadRequestException({
        code: 'COUNTRY_REQUIRED',
        message: 'A billing country is required before the first checkout.',
      });
    }

    const currency = resolveBillingCurrency(country);

    let customerId = organization.stripeCustomerId;

    // 3. Create Stripe Customer if not exists
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

    // 4. Resolve Price ID. Es el mismo para todas las monedas; `currency` decide el importe.
    const priceId = await this.priceCatalog.priceIdFor(planName);

    // 5. Create Checkout Session
    const frontendUrl = this.configService.get('FRONTEND_URL') ?? 'http://localhost:3000';

    const sessionUrl = await this.billingService.createCheckoutSession({
      customerId,
      priceId,
      currency,
      successUrl: `${frontendUrl}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${frontendUrl}/billing?canceled=true`,
      metadata: {
        organizationId,
        plan: planName,
      },
      allowPromotionCodes: true,
    });

    // 6. Persistir el país solo ahora, con la sesión ya creada.
    // Si se escribiera antes, un fallo de Stripe —o un modal que el usuario abandona— dejaría a
    // la organización anclada a una moneda que nunca llegó a usar, y el campo no se puede
    // corregir desde la aplicación.
    if (!organization.country) {
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: { country },
      });
    }

    return { url: sessionUrl };
  }

  /**
   * Recarga de créditos de compra única (cantidad libre, no paquetes fijos). A diferencia de
   * `POST /billing/checkout`, no exige que la organización carezca de suscripción — al
   * contrario: exige que SÍ tenga una activa. Es justo el candado que evita que alguien compre
   * un lote grande de créditos y luego cancele para seguir gastándolo sin volver a pagar, que es
   * el mismo hueco que cierra el gate de `canExecuteWorkflow`.
   */
  @Post('credits/checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async createCreditCheckoutSession(
    @Req() req: Request & { user: UserPayload },
    @Body() body: CreateCreditCheckoutDto,
  ) {
    const organizationId = req.user.organizationId;
    const userEmail = req.user.email;
    const userName = req.user.name ?? 'Admin User';

    if (!organizationId) {
      throw new BadRequestException('User does not belong to an organization');
    }

    // Segunda barrera además de los decoradores del DTO: `class-validator` valida el rango pero
    // no el múltiplo de `CREDIT_TOPUP_LIMITS.step`.
    if (!isValidTopUpQuantity(body.credits)) {
      throw new BadRequestException(
        `credits must be between ${CREDIT_TOPUP_LIMITS.min} and ${CREDIT_TOPUP_LIMITS.max}, in multiples of ${CREDIT_TOPUP_LIMITS.step}`,
      );
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { subscription: { select: { status: true, pastDueSince: true } } },
    });

    if (!organization) {
      throw new BadRequestException('Organization not found');
    }

    const subscriptionAccess = resolveSubscriptionAccess({
      status: organization.subscription?.status ?? null,
      pastDueSince: organization.subscription?.pastDueSince ?? null,
    });

    if (!subscriptionAccess.allowed) {
      throw new ForbiddenException(`Cannot purchase credits: ${subscriptionAccess.reason}`);
    }

    // Segundo factor, siempre que el usuario lo tenga activado — sin importar el monto. El JWT
    // no carga este dato, así que se consulta a la base.
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { twoFactorEnabled: true },
    });

    if (user?.twoFactorEnabled) {
      if (!body.code2FA) {
        throw new ForbiddenException('2FA_REQUIRED');
      }
      const verified = await this.twoFactorService.verifySecondFactor(req.user.sub, body.code2FA);
      if (!verified) {
        throw new BadRequestException('2FA_INVALID');
      }
    }

    const country = organization.country;
    if (!country) {
      throw new BadRequestException({
        code: 'COUNTRY_REQUIRED',
        message: 'A billing country is required before purchasing credits.',
      });
    }

    const currency = resolveBillingCurrency(country);

    let customerId = organization.stripeCustomerId;

    if (!customerId) {
      customerId = await this.billingService.createCustomer({
        email: userEmail,
        name: organization.name ?? userName,
        metadata: { organizationId },
      });

      await this.prisma.organization.update({
        where: { id: organizationId },
        data: { stripeCustomerId: customerId },
      });
    }

    const priceId = await this.priceCatalog.topUpPriceId();
    const frontendUrl = this.configService.get('FRONTEND_URL') ?? 'http://localhost:3000';

    const sessionUrl = await this.billingService.createCreditTopUpCheckoutSession({
      customerId,
      priceId,
      credits: body.credits,
      currency,
      successUrl: `${frontendUrl}/billing?topup=success`,
      cancelUrl: `${frontendUrl}/billing?topup=canceled`,
      metadata: {
        organizationId,
        credits: body.credits.toString(),
        purchasedBy: userEmail,
        userId: req.user.sub,
      },
    });

    return { url: sessionUrl };
  }

  @Post('portal')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async createPortalSession(@Req() req: Request & { user: UserPayload }) {
    const organizationId = req.user.organizationId;
    const userEmail = req.user.email;
    const userName = req.user.name ?? 'Admin User';

    if (!organizationId) {
      throw new BadRequestException('User does not belong to an organization');
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new BadRequestException('Organization not found');
    }

    let customerId = organization.stripeCustomerId;

    // Create Stripe Customer if not exists so FREE users can access their portal
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

    const frontendUrl = this.configService.get('FRONTEND_URL') ?? 'http://localhost:3000';
    const returnUrl = `${frontendUrl}/billing/plans?from_portal=1`;

    const url = await this.billingService.createCustomerPortalSession(customerId, returnUrl);

    return { url };
  }

  /**
   * Catálogo de planes con sus importes vigentes.
   *
   * La configuración del plan (límites, features) sale de `PLANS`; los importes salen de Stripe
   * en el momento. Esa es la razón de que subir un precio no requiera un despliegue: no hay
   * ninguna cifra de dinero compilada en el bundle que haya que actualizar.
   *
   * Ruta pública, así que el `PriceCatalogService` cachea la respuesta de Stripe y no se sale a
   * la red en cada visita a la página de precios.
   */
  @Get('plans')
  async getPlans(): Promise<BillingPlansResponse> {
    const plans = await Promise.all(
      Object.values(PLANS).map(async (plan) => ({
        ...plan,
        // FREE no tiene precio en Stripe pero sí tiene un importe conocido, y es el único: cero
        // en cualquier moneda. Sin esto la tarjeta mostraría un guion en vez de "$0".
        // ENTERPRISE sí queda sin importes a propósito, porque se negocia caso por caso.
        price:
          plan.type === SharedSubscriptionPlan.FREE
            ? { usd: 0, mxn: 0 }
            : await this.priceCatalog.pricesFor(plan.type),
      })),
    );

    // El precio del overage no pertenece a ningún plan pero la UI lo necesita para el aviso de
    // consumo, así que viaja en la misma respuesta en vez de en un endpoint aparte. Lo mismo
    // aplica a la recarga de créditos: sale del mismo catálogo de Stripe y se usa en las mismas
    // pantallas de Billing.
    return {
      plans,
      overagePerCredit: await this.priceCatalog.overagePrices(),
      creditTopUp: {
        perCredit: await this.priceCatalog.topUpPrices(),
        min: CREDIT_TOPUP_LIMITS.min,
        max: CREDIT_TOPUP_LIMITS.max,
        step: CREDIT_TOPUP_LIMITS.step,
      },
    };
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
        status: SubscriptionStatus.ACTIVE,
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
    if (!PLANS[body.plan]) {
      throw new BadRequestException(`Invalid plan: ${body.plan}`);
    }

    await this.billingService.changePlan(organizationId, body.plan);
    return { message: 'Plan update initiated successfully' };
  }

  @Get('dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async getDashboardData(
    @Req() req: Request & { user: UserPayload },
  ): Promise<BillingDashboardDto> {
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

  @Patch('subscription/resume')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async resumeSubscription(@CurrentUser() user: UserPayload) {
    const organizationId = user.organizationId;
    if (!organizationId) {
      throw new BadRequestException('User does not belong to an organization');
    }
    await this.billingService.resumeSubscription(organizationId);
    return { message: 'Subscription resumed successfully' };
  }

  @Patch('subscription/cancel-downgrade')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async cancelPendingDowngrade(@CurrentUser() user: UserPayload) {
    const organizationId = user.organizationId;
    if (!organizationId) {
      throw new BadRequestException('User does not belong to an organization');
    }
    await this.billingService.cancelPendingDowngrade(organizationId);
    return { message: 'Pending downgrade cancelled successfully' };
  }

  /**
   * Webhook de Stripe.
   *
   * Procesa antes de responder, a propósito: los reintentos de Stripe son la red
   * de seguridad ante fallos transitorios, y responder 200 antes de tiempo los
   * anularía (Stripe no reintenta un 2xx, así que el evento se perdería).
   *
   * Los códigos importan porque Stripe deshabilita endpoints que fallan seguido:
   *   - 400 → error de configuración nuestro; reintentar no lo arregla.
   *   - 503 → fallo transitorio; Stripe reintenta con backoff.
   * Devolver 400 ante un hipo de la base de datos, como se hacía antes, quemaba
   * el endpoint de producción sin motivo.
   */
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @Post('webhook')
  async handleWebhook(@Headers('stripe-signature') signature: string, @Req() request: Request) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET no está configurado');
      throw new InternalServerErrorException('Webhook secret not configured');
    }

    // Verify signature and construct event
    let event: Stripe.Event;
    try {
      const rawBody = (request as unknown as { rawBody?: string | Buffer }).rawBody;
      if (!rawBody) {
        throw new Error('Raw body not available. Ensure `rawBody: true` is set in main.ts');
      }
      event = this.stripeClient.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Webhook Signature Verification Failed: ${message}`);
      throw new BadRequestException(`Webhook Error: ${message}`);
    }

    // Idempotencia: varios handlers son aditivos (addCredits suma al balance,
    // invoiceItems.create cobra al cliente), así que reprocesar duplica dinero.
    const isNew = await this.webhookDedup.claim(WEBHOOK_PROVIDER_STRIPE, event.id, event.type);
    if (!isNew) {
      this.logger.log(`Evento de Stripe ${event.id} (${event.type}) ya procesado, se omite`);
      return { received: true, duplicate: true };
    }

    try {
      await this.billingService.handleWebhookEvent(event);
    } catch (err: unknown) {
      // Liberamos el claim para que el reintento de Stripe sí reprocese.
      await this.webhookDedup.release(WEBHOOK_PROVIDER_STRIPE, event.id);

      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Fallo procesando el evento de Stripe ${event.id} (${event.type}): ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw new ServiceUnavailableException(`Webhook Processing Error: ${message}`);
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
