import type { PrismaService } from '@/platform/database/prisma.service';
import { creditsSpentInCurrentPeriod } from './credits-period';

const decimal = (value: number) => ({ toNumber: () => value });

function prismaMock(organization: unknown, sum: { amount: number | null; costUSD: unknown }) {
  return {
    organization: { findUnique: jest.fn().mockResolvedValue(organization) },
    creditTransaction: { aggregate: jest.fn().mockResolvedValue({ _sum: sum }) },
  } as unknown as PrismaService & {
    creditTransaction: { aggregate: jest.Mock };
  };
}

describe('creditsSpentInCurrentPeriod', () => {
  it('cuenta desde el inicio del periodo de la suscripción y solo deducciones de ejecución', async () => {
    const periodStart = new Date('2026-09-15T06:00:00Z');
    const prisma = prismaMock(
      { timezone: 'America/Mexico_City', subscription: { currentPeriodStart: periodStart } },
      { amount: -120, costUSD: decimal(0.42) },
    );

    const result = await creditsSpentInCurrentPeriod(prisma, 'org-1');

    expect(result).toEqual({ credits: 120, costUSD: 0.42, periodStart });
    expect(prisma.creditTransaction.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          type: 'EXECUTION_DEDUCTION',
          createdAt: { gte: periodStart },
        },
      }),
    );
  });

  it('sin suscripción usa el inicio del mes en la zona de la organización', async () => {
    const prisma = prismaMock(
      { timezone: 'America/Mexico_City', subscription: null },
      { amount: null, costUSD: null },
    );

    // 1 de octubre, 02:00 UTC = todavía 30 de septiembre en México.
    const result = await creditsSpentInCurrentPeriod(
      prisma,
      'org-1',
      new Date('2026-10-01T02:00:00Z'),
    );

    expect(result.credits).toBe(0);
    expect(result.costUSD).toBe(0);
    // Inicio de septiembre en México (UTC-6).
    expect(result.periodStart.toISOString()).toBe('2026-09-01T06:00:00.000Z');
  });
});
