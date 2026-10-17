'use client';

import { useLocale, useTranslations } from 'next-intl';
import { toIntlLocale } from '@/lib/intl-locale';
import { useAdminLlmModelsOverview } from '@/hooks/billing/use-admin-analytics';
import { OverviewCard, OverviewCardsSkeleton } from '@/components/admin/overview-card';

/**
 * Catálogo de modelos contra su uso real, arriba de la página de modelos. Solo informativo: la
 * página ya tiene sus propios filtros por tier, categoría y estado.
 */
export function LlmModelsOverviewCards() {
  const t = useTranslations('Admin.LlmModels.Overview');
  const intlLocale = toIntlLocale(useLocale());
  const { data } = useAdminLlmModelsOverview();

  if (!data) return <OverviewCardsSkeleton />;

  const usd = (value: number) =>
    new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: value < 10 ? 4 : 2,
    }).format(value);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <OverviewCard
        label={t('activeTitle')}
        value={String(data.active)}
        hint={t('activeHint', {
          basic: data.byTier.BASIC ?? 0,
          standard: data.byTier.STANDARD ?? 0,
          premium: data.byTier.PREMIUM ?? 0,
          providers: data.providers,
        })}
      />
      <OverviewCard
        label={t('usedTitle', { days: data.days })}
        value={String(data.used)}
        hint={
          <>
            <span className="block">{t('usedHint', { unused: data.activeUnused })}</span>
            {data.usedNotInCatalog > 0 && (
              <span className="block text-[var(--warning-text-adaptive)]">
                {t('usedNotInCatalog', { count: data.usedNotInCatalog })}
              </span>
            )}
          </>
        }
      />
      <OverviewCard
        label={t('topTitle', { days: data.days })}
        textValue
        value={data.top?.model ?? '—'}
        hint={
          data.top
            ? t('topHint', { cost: usd(data.top.costUSD), pct: data.top.sharePct })
            : t('noUsage')
        }
      />
      <OverviewCard
        label={t('spendTitle', { days: data.days })}
        value={usd(data.totalCostUSD)}
        hint={t('spendHint')}
      />
    </div>
  );
}
