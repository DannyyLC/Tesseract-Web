import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@/platform/database/prisma.service';
import {
  WorkflowCategory,
  TransactionType,
  UserRole,
  InvoiceType,
  InvoiceStatus,
  CfdiStatus,
  Prisma,
} from '@tesseract/database';
import {
  PaginatedResponse,
  getWorkflowCreditCost,
  getPlanLimits,
  NOTIFICATIONSENUM,
  resolveSubscriptionAccess,
  SubscriptionDenialReason,
} from '@tesseract/types';
import { CreditBalance } from '@tesseract/database';
import { DashboardCreditsDto } from './dto/dashboard-credits.dto';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { DashboardCreditTransactionDto } from './dto/dashboard-credit-transaction.dto';
import { CursorPaginatedResponseUtils } from '@/platform/common/responses/cursor-paginated-response';
import { UtilityService } from '@/platform/utility/utility.service';
import { creditsSpentInCurrentPeriod } from './credits-period';
import { PROJECTION_WINDOW_DAYS, projectCredits, type CreditProjection } from './credit-projection';
import { resolveTimezone } from '@/platform/common/utils/resolve-timezone';
import { addDaysInZone, startOfDayInZone, zonedDayKey } from '@/platform/common/utils/zoned-dates';

/** Días de saldo real que se muestran antes de la proyección en la gráfica del cliente. */
const PROJECTION_HISTORY_DAYS = 14;

export interface CreditsProjectionResult extends CreditProjection {
  timezone: string;
  balance: number;
  monthlyCredits: number;
  /** Saldo real al cierre de cada día local, terminando hoy con el saldo actual. */
  history: { date: string; balance: number }[];
}

const LOW_CREDITS_THRESHOLD_PERCENTAGE = 0.2;
const OVERAGE_LIMIT_NOTIFICATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CreditsService {
  constructor(
    private prisma: PrismaService,
    private readonly utilityService: UtilityService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  // ============================================
  // CREATE
  // ============================================
  /**
   * Crear creditBalance para una organizacion nueva
   */
  async create(organizationId: string): Promise<CreditBalance | null> {
    try {
      return await this.prisma.creditBalance.create({
        data: {
          organizationId: organizationId,
          balance: 0,
          lifetimeEarned: 0,
          lifetimeSpent: 0,
          currentMonthSpent: 0,
          currentMonthCostUSD: 0,
        },
      });
    } catch (error) {
      this.logger.error(
        `create method >> Error creando credit balance para org ${organizationId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Añadir créditos a una organización (Legacy/Suscripción/Compra)
   */
  async addCredits(
    organizationId: string,
    amount: number,
    type: TransactionType,
    description?: string,
    metadata?: Record<string, unknown>,
    costUSD?: number,
    subscriptionId?: string,
    invoiceId?: string,
  ): Promise<void> {
    const balance = await this.prisma.creditBalance.findUnique({
      where: { organizationId },
    });

    if (!balance) {
      throw new Error('Credit balance not found');
    }

    const balanceBefore = balance.balance;
    const balanceAfter = balanceBefore + amount;

    await this.prisma.$transaction([
      this.prisma.creditBalance.update({
        where: { organizationId },
        data: {
          balance: balanceAfter,
          lifetimeEarned: { increment: amount },
        },
      }),
      this.prisma.creditTransaction.create({
        data: {
          organizationId,
          type,
          amount,
          balanceBefore,
          balanceAfter,
          description,
          metadata: metadata as Prisma.InputJsonObject | undefined,
          costUSD,
          subscriptionId,
          invoiceId,
        },
      }),
    ]);
  }

  /**
   * Acredita una recarga de créditos de compra única (Checkout `mode: 'payment'`), registrando
   * su propia `Invoice` local en la misma transacción.
   *
   * A diferencia de `addCredits`, aquí sí hace falta idempotencia real: el webhook que llama a
   * este método es `checkout.session.completed`, y Stripe reintenta si la respuesta tarda o
   * falla. Reprocesar con `addCredits` duplicaría el abono; aquí, en cambio, `invoiceNumber` es
   * `@unique` en `Invoice` y actúa como candado — un reintento choca con esa restricción
   * (`P2002`) y se resuelve como "ya procesado" sin tocar el saldo ni la factura existente.
   *
   * El `id` de la factura se genera antes de la transacción (en vez de dejar que Prisma lo
   * autogenere) porque `CreditTransaction.invoiceId` necesita conocerlo para poder crearse en el
   * mismo array de operaciones — un `$transaction` de array, a diferencia de uno interactivo, no
   * permite que una operación use el resultado de la anterior.
   */
  async grantPurchasedCredits(params: {
    organizationId: string;
    credits: number;
    /** Idempotency key: normalmente `TOPUP-<stripeCheckoutSessionId>`. */
    invoiceNumber: string;
    /** Importe cobrado, en unidades mayores (no centavos) — así es como lo guarda `Invoice`. */
    amountMajor: number;
    cfdiStatus: CfdiStatus;
    stripePaymentIntentId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ invoiceId: string; deduped: boolean }> {
    const balance = await this.prisma.creditBalance.findUnique({
      where: { organizationId: params.organizationId },
    });

    if (!balance) {
      throw new Error('Credit balance not found');
    }

    const balanceBefore = balance.balance;
    const balanceAfter = balanceBefore + params.credits;
    const invoiceId = randomUUID();

    try {
      await this.prisma.$transaction([
        this.prisma.invoice.create({
          data: {
            id: invoiceId,
            organizationId: params.organizationId,
            invoiceNumber: params.invoiceNumber,
            type: InvoiceType.ONE_TIME,
            status: InvoiceStatus.PAID,
            subtotal: params.amountMajor,
            total: params.amountMajor,
            tax: 0,
            stripePaymentIntentId: params.stripePaymentIntentId,
            paidAt: new Date(),
            cfdiStatus: params.cfdiStatus,
          },
        }),
        this.prisma.creditBalance.update({
          where: { organizationId: params.organizationId },
          data: {
            balance: balanceAfter,
            lifetimeEarned: { increment: params.credits },
          },
        }),
        this.prisma.creditTransaction.create({
          data: {
            organizationId: params.organizationId,
            type: TransactionType.ONE_TIME_PURCHASE,
            amount: params.credits,
            balanceBefore,
            balanceAfter,
            description: `Recarga de ${params.credits} créditos`,
            metadata: params.metadata as Prisma.InputJsonObject | undefined,
            invoiceId,
          },
        }),
      ]);

      return { invoiceId, deduped: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.info(
          `grantPurchasedCredits >> Recarga ${params.invoiceNumber} ya estaba procesada, se omite`,
        );
        const existing = await this.prisma.invoice.findUnique({
          where: { invoiceNumber: params.invoiceNumber },
          select: { id: true },
        });
        // No debería faltar (P2002 fue justo por esta clave), pero si faltara no hay factura que
        // timbrar: mejor devolver el id que se iba a usar que lanzar por algo ya resuelto.
        return { invoiceId: existing?.id ?? invoiceId, deduped: true };
      }
      throw error;
    }
  }

  /**
   * Validar si una organización puede ejecutar un workflow
   *
   * El saldo de créditos no caduca, pero solo se puede **gastar** con una suscripción activa
   * (o dentro de la gracia tras un cobro fallido). Sin eso, un cliente cancelado con saldo a
   * favor podría seguir ejecutando workflows indefinidamente — cada ejecución sigue costando
   * Cloud Run/Cloud SQL aunque el saldo ya esté pagado y no haya certeza de que vuelva a pagar.
   * Ver `resolveSubscriptionAccess` (packages/types) para la regla completa.
   */
  async canExecuteWorkflow(
    organizationId: string,
    workflowCategory: WorkflowCategory,
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Obtener balance y configuración de la org
    const [balance, org] = await Promise.all([
      this.prisma.creditBalance.findUnique({
        where: { organizationId },
      }),
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
          allowOverages: true,
          overageLimit: true,
          plan: true,
          subscription: { select: { status: true, pastDueSince: true } },
        },
      }),
    ]);

    if (!balance || !org) {
      return { allowed: false, reason: 'Organization or balance not found' };
    }

    // Chequeo de suscripción, antes que el de saldo: a alguien sin suscripción activa no le
    // sirve de nada tener crédito — el problema no es que le falten créditos, es que no hay
    // relación de pago vigente que justifique seguir consumiendo infraestructura.
    const subscriptionAccess = resolveSubscriptionAccess({
      status: org.subscription?.status ?? null,
      pastDueSince: org.subscription?.pastDueSince ?? null,
    });

    if (!subscriptionAccess.allowed) {
      if (subscriptionAccess.reason === 'SUBSCRIPTION_PAST_DUE') {
        await this.notifySubscriptionSuspendedOnce(organizationId);
      }
      return {
        allowed: false,
        reason: this.describeSubscriptionDenial(subscriptionAccess.reason),
      };
    }

    const requiredCredits = getWorkflowCreditCost(workflowCategory);

    // Caso 1: Tiene créditos suficientes
    if (balance.balance >= requiredCredits) {
      return { allowed: true };
    }

    // Caso 2: No permite overages
    if (!org.allowOverages) {
      return {
        allowed: false,
        reason: `Insufficient credits (${balance.balance}/${requiredCredits}) and overages not allowed`,
      };
    }

    // Caso 3: Validar límite de overage
    const balanceAfter = balance.balance - requiredCredits;
    const overageLimit = org.overageLimit;

    if (overageLimit === null) {
      return {
        allowed: false,
        reason: 'Overage limit not configured',
      };
    }

    if (Math.abs(balanceAfter) <= overageLimit) {
      return { allowed: true };
    }

    const shouldNotifyOverageLimit =
      await this.shouldSendOverageLimitReachedNotification(organizationId);

    if (shouldNotifyOverageLimit) {
      await this.utilityService.sendNotificationToAppClients(
        organizationId,
        [UserRole.OWNER, UserRole.ADMIN],
        NOTIFICATIONSENUM.OVERAGE_LIMIT_REACHED,
        [Math.abs(balanceAfter).toString(), overageLimit.toString()],
      );
    }

    return {
      allowed: false,
      reason: `Would exceed overage limit (${Math.abs(balanceAfter)}/${overageLimit})`,
    };
  }

  /**
   * Descontar créditos después de ejecutar un workflow
   */
  async deductCredits(
    organizationId: string,
    executionId: string,
    workflowId: string,
    workflowCategory: WorkflowCategory,
    workflowName: string,
    costUSD?: number,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    // Obtener balance actual
    const balance = await this.prisma.creditBalance.findUnique({
      where: { organizationId },
    });

    if (!balance) {
      throw new Error('Credit balance not found');
    }

    const credits = getWorkflowCreditCost(workflowCategory);
    const balanceBefore = balance.balance;
    const balanceAfter = balanceBefore - credits;

    // Transacción atómica para actualizar todo
    await this.prisma.$transaction([
      // 1. Actualizar CreditBalance
      this.prisma.creditBalance.update({
        where: { organizationId },
        data: {
          balance: balanceAfter,
          lifetimeSpent: { increment: credits },
          currentMonthSpent: { increment: credits },
          currentMonthCostUSD: { increment: costUSD ?? 0 },
        },
      }),

      // 2. Crear CreditTransaction
      this.prisma.creditTransaction.create({
        data: {
          organizationId,
          type: 'EXECUTION_DEDUCTION',
          amount: -credits,
          balanceBefore,
          balanceAfter,
          executionId,
          workflowCategory,
          costUSD: costUSD ?? undefined,
          description: `Execution of ${workflowCategory} workflow: ${workflowName}`,
          metadata: metadata as Prisma.InputJsonObject | undefined,
        },
      }),

      // 3. Actualizar campos en Execution
      this.prisma.execution.update({
        where: { id: executionId },
        data: {
          credits,
          balanceBefore,
          balanceAfter,
          wasOverage: balanceAfter < 0,
        },
      }),

      // 4. Actualizar estadísticas del workflow
      this.prisma.workflow.update({
        where: { id: workflowId },
        data: {
          totalCreditsConsumed: { increment: credits },
        },
      }),
    ]);

    // 5. Calcular y actualizar promedio (fuera de transacción)
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: { totalCreditsConsumed: true, totalExecutions: true },
    });

    if (workflow && workflow.totalExecutions > 0) {
      const avgCredits = workflow.totalCreditsConsumed / workflow.totalExecutions;
      await this.prisma.workflow.update({
        where: { id: workflowId },
        data: { avgCreditsPerExecution: avgCredits },
      });
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true },
    });

    if (organization) {
      const planMonthlyCredits = getPlanLimits(organization.plan).monthlyCredits;
      const lowCreditsThreshold = Math.max(
        1,
        Math.ceil(planMonthlyCredits * LOW_CREDITS_THRESHOLD_PERCENTAGE),
      );

      // ZERO_CREDITS solo al cruce por el 0 dentro del rango de la ejecucion.
      // Ejemplos: 5 -> 0, 2 -> -3 (ambos notifican); 0 -> -5 (no repite).
      const crossedZero = balanceBefore > 0 && balanceAfter <= 0;

      // CONSUMPTION_ALERT solo al cruce del umbral (20% del plan) y con saldo aun positivo.
      const crossedLowCreditsThreshold =
        balanceBefore > lowCreditsThreshold &&
        balanceAfter <= lowCreditsThreshold &&
        balanceAfter > 0;

      if (crossedZero) {
        await this.utilityService.sendNotificationToAppClients(
          organizationId,
          [UserRole.OWNER, UserRole.ADMIN],
          NOTIFICATIONSENUM.ZERO_CREDITS,
        );
      } else if (crossedLowCreditsThreshold) {
        await this.utilityService.sendNotificationToAppClients(
          organizationId,
          [UserRole.OWNER, UserRole.ADMIN],
          NOTIFICATIONSENUM.CONSUMPTION_ALERT,
          [balanceAfter.toString()],
        );
      }
    }
  }

  private async shouldSendOverageLimitReachedNotification(
    organizationId: string,
  ): Promise<boolean> {
    return this.shouldSendCooldownNotification(
      organizationId,
      NOTIFICATIONSENUM.OVERAGE_LIMIT_REACHED,
      OVERAGE_LIMIT_NOTIFICATION_COOLDOWN_MS,
    );
  }

  /**
   * Igual que `shouldSendOverageLimitReachedNotification`, pero genérico por código de
   * notificación: evita mandar el mismo aviso en cada ejecución bloqueada mientras la causa no
   * cambia (p.ej. cada intento de ejecutar con la gracia de `PAST_DUE` ya agotada).
   */
  private async shouldSendCooldownNotification(
    organizationId: string,
    notificationCode: string,
    cooldownMs: number,
  ): Promise<boolean> {
    const latestNotification = await this.prisma.userNotification.findFirst({
      where: {
        organizationId,
        notification: {
          code: notificationCode,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        createdAt: true,
      },
    });

    if (!latestNotification) {
      return true;
    }

    const elapsedTimeMs = Date.now() - latestNotification.createdAt.getTime();
    return elapsedTimeMs >= cooldownMs;
  }

  /**
   * Avisa que el servicio quedó suspendido por falta de pago, la primera vez que se deniega una
   * ejecución por gracia de `PAST_DUE` agotada (con el mismo cooldown de 24h que el resto de los
   * avisos de esta clase, para no repetirlo en cada intento de ejecución bloqueado).
   */
  private async notifySubscriptionSuspendedOnce(organizationId: string): Promise<void> {
    const shouldNotify = await this.shouldSendCooldownNotification(
      organizationId,
      NOTIFICATIONSENUM.SUBSCRIPTION_SUSPENDED,
      OVERAGE_LIMIT_NOTIFICATION_COOLDOWN_MS,
    );

    if (shouldNotify) {
      await this.utilityService.sendNotificationToAppClients(
        organizationId,
        [UserRole.OWNER, UserRole.ADMIN],
        NOTIFICATIONSENUM.SUBSCRIPTION_SUSPENDED,
      );
    }
  }

  /** Mensaje legible del motivo de bloqueo, para el `ForbiddenException` que ve el cliente. */
  private describeSubscriptionDenial(reason: SubscriptionDenialReason): string {
    switch (reason) {
      case 'NO_SUBSCRIPTION':
        return 'No active subscription';
      case 'SUBSCRIPTION_CANCELED':
        return 'Subscription canceled';
      case 'SUBSCRIPTION_PAST_DUE':
        return 'Subscription payment failed and the grace period has expired';
    }
  }

  /**
   * Proyección del saldo de créditos para el dashboard del cliente (ver `credit-projection.ts`).
   * Aquí solo se juntan los datos: saldo, renovación, sobregiro y consumo por día local.
   */
  async getProjection(
    organizationId: string,
    now: Date = new Date(),
  ): Promise<CreditsProjectionResult> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        plan: true,
        timezone: true,
        createdAt: true,
        allowOverages: true,
        overageLimit: true,
        creditBalance: { select: { balance: true } },
        subscription: {
          select: { status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
        },
      },
    });
    if (!organization) throw new NotFoundException('Organización no encontrada');

    const timezone = resolveTimezone(organization.timezone);
    const today = startOfDayInZone(now, timezone);
    const windowStart = addDaysInZone(today, -PROJECTION_WINDOW_DAYS, timezone);
    const historyStartDay = addDaysInZone(today, -(PROJECTION_HISTORY_DAYS - 1), timezone);
    const balance = organization.creditBalance?.balance ?? 0;
    const limits = getPlanLimits(organization.plan);

    // Doble `AT TIME ZONE`: `createdAt` es `timestamp(3)` sin zona (ver CLAUDE.md).
    const [consumptionRows, netRows, firstDeduction] = await Promise.all([
      this.prisma.$queryRaw<{ day: Date; credits: number }[]>`
        SELECT (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date AS day,
               COALESCE(SUM(-amount), 0)::int AS credits
        FROM credit_transactions
        WHERE "organizationId" = ${organizationId} AND type = 'EXECUTION_DEDUCTION'
          AND "createdAt" >= ${windowStart}
        GROUP BY 1
      `,
      this.prisma.$queryRaw<{ day: Date; net: number }[]>`
        SELECT (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date AS day,
               COALESCE(SUM(amount), 0)::int AS net
        FROM credit_transactions
        WHERE "organizationId" = ${organizationId} AND "createdAt" >= ${historyStartDay}
        GROUP BY 1
      `,
      this.prisma.creditTransaction.findFirst({
        where: { organizationId, type: 'EXECUTION_DEDUCTION' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);

    // `::date` llega como medianoche UTC de ese día local: se lee el Y-M-D en UTC.
    const dayOf = (value: Date) => value.toISOString().slice(0, 10);
    const todayKey = zonedDayKey(today, timezone);
    const dailyConsumption = new Map<string, number>();
    let consumedToday = 0;
    for (const row of consumptionRows) {
      const key = dayOf(row.day);
      if (key === todayKey) consumedToday = Number(row.credits);
      else dailyConsumption.set(key, Number(row.credits));
    }

    // Se renueva solo si la suscripción está al día, no se cancela y su fin aún no pasó: una
    // manual vencida y sin renovar no repone nada por sí sola.
    const subscription = organization.subscription;
    const renewalDate =
      subscription &&
      subscription.status === 'ACTIVE' &&
      !subscription.cancelAtPeriodEnd &&
      limits.monthlyCredits > 0 &&
      subscription.currentPeriodEnd > now
        ? subscription.currentPeriodEnd
        : null;

    // Historial real: desde la primera ejecución cobrada (o la creación, si fue después).
    const historyStart =
      firstDeduction && firstDeduction.createdAt > organization.createdAt
        ? firstDeduction.createdAt
        : organization.createdAt;

    const projection = projectCredits({
      now,
      timezone,
      balance,
      consumedToday,
      dailyConsumption,
      historyStart,
      renewalDate,
      overageLimit: organization.allowOverages
        ? (organization.overageLimit ?? limits.overageLimit)
        : null,
    });

    // Saldo al cierre de cada día, hacia atrás desde el actual: cierre(d-1) = cierre(d) − neto(d).
    const netByDay = new Map(netRows.map((row) => [dayOf(row.day), Number(row.net)]));
    const history: CreditsProjectionResult['history'] = [];
    let closing = balance;
    for (let back = 0; back < PROJECTION_HISTORY_DAYS; back++) {
      const key = zonedDayKey(addDaysInZone(today, -back, timezone), timezone);
      history.unshift({ date: key, balance: closing });
      closing -= netByDay.get(key) ?? 0;
    }

    return {
      ...projection,
      timezone,
      balance,
      monthlyCredits: limits.monthlyCredits,
      history,
    };
  }

  async getDashboardData(
    organizationId: string,
    cursor?: string | null,
    pageSize = 10,
    paginationAction?: 'next' | 'prev' | null,
  ): Promise<DashboardCreditsDto | null> {
    const balance = await this.prisma.creditBalance.findUnique({
      where: { organizationId },
      select: {
        id: true,
        balance: true,
        currentMonthSpent: true,
      },
    });
    if (!balance) {
      this.logger.error(
        `getDashboardData method >> No credit balance found for organization ${organizationId}`,
      );
      return null;
    }
    this.logger.info(
      `getDashboardData method >> Retrieved credit balance for organization ${organizationId}: ${JSON.stringify(balance)}`,
    );
    return {
      ...balance,
      // Desde las transacciones del periodo: la columna `currentMonthSpent` nunca se reinicia.
      currentMonthSpent: (await creditsSpentInCurrentPeriod(this.prisma, organizationId)).credits,
      creditTransactions: await this.getCreditTransactionsForOrganization(
        organizationId,
        cursor,
        pageSize,
        paginationAction,
      ),
    };
  }

  async getCreditTransactionsForOrganization(
    organizationId: string,
    cursor?: string | null,
    pageSize = 10,
    paginationAction?: 'next' | 'prev' | null,
  ): Promise<PaginatedResponse<DashboardCreditTransactionDto>> {
    const creditTransactions = await this.prisma.creditTransaction.findMany({
      where: { organizationId },
      take:
        paginationAction === 'next' || paginationAction === null ? pageSize + 1 : -(pageSize + 1),
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      select: {
        id: true,
        type: true,
        amount: true,
        balanceBefore: true,
        balanceAfter: true,
        workflowCategory: true,
        description: true,
        createdAt: true,
        executionId: true,
        invoiceId: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const paginatedTransactions = await CursorPaginatedResponseUtils.getInstance().build(
      creditTransactions,
      pageSize,
      paginationAction,
    );

    return paginatedTransactions;
  }
}
