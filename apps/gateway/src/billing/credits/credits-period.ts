import type { PrismaService } from '@/platform/database/prisma.service';
import { resolveTimezone } from '@/platform/common/utils/resolve-timezone';
import { startOfMonthInZone } from '@/platform/common/utils/zoned-dates';

export interface PeriodSpend {
  /** Créditos consumidos por ejecuciones desde el inicio del periodo. */
  credits: number;
  /** Costo real (USD) de esas ejecuciones. Interno: no se le muestra al cliente. */
  costUSD: number;
  periodStart: Date;
}

/**
 * Gasto del periodo de facturación en curso, calculado desde las transacciones.
 *
 * Reemplaza a `CreditBalance.currentMonthSpent` / `currentMonthCostUSD` para cualquier cosa que
 * se muestre: esas columnas solo se incrementan y nada las reinicia al renovar, así que en la
 * práctica acumulan todo lo gastado desde que se creó la organización.
 *
 * El periodo empieza en `Subscription.currentPeriodStart`; sin suscripción (FREE) es el mes
 * calendario en la zona de la organización. Solo cuenta `EXECUTION_DEDUCTION`: recargas,
 * renovaciones y ajustes manuales no son consumo.
 *
 * Función suelta y no un método de `CreditsService` para poder usarla desde servicios que no
 * pueden inyectarlo sin crear un ciclo entre módulos (organizaciones, facturación).
 */
export async function creditsSpentInCurrentPeriod(
  prisma: PrismaService,
  organizationId: string,
  now: Date = new Date(),
): Promise<PeriodSpend> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true, subscription: { select: { currentPeriodStart: true } } },
  });

  const periodStart =
    organization?.subscription?.currentPeriodStart ??
    startOfMonthInZone(now, resolveTimezone(organization?.timezone));

  const { _sum } = await prisma.creditTransaction.aggregate({
    where: { organizationId, type: 'EXECUTION_DEDUCTION', createdAt: { gte: periodStart } },
    _sum: { amount: true, costUSD: true },
  });

  return {
    // Las deducciones se guardan en negativo.
    credits: 0 - (_sum.amount ?? 0),
    costUSD: _sum.costUSD?.toNumber() ?? 0,
    periodStart,
  };
}
