'use client';

import { AlertTriangle, Building2, Moon, TrendingUp } from 'lucide-react';
import { OverviewCard, OverviewCardsSkeleton } from '@/components/admin/overview-card';
import { useLocale, useTranslations } from 'next-intl';
import { toIntlLocale } from '@/lib/intl-locale';
import { useAdminOrganizationsOverview } from '@/hooks/identity/use-admin-organizations';
import type { AdminOrganizationSegment } from '@/lib/api/endpoints/identity/organizations/organizations-admin-api';

interface Props {
  segment: AdminOrganizationSegment | null;
  onSegmentChange: (segment: AdminOrganizationSegment | null) => void;
}

/**
 * Cuatro números arriba del listado, cada uno con una acción detrás: al hacer clic filtra el
 * listado a esas organizaciones. La primera quita el filtro.
 */
export function OrganizationsOverviewCards({ segment, onSegmentChange }: Props) {
  const t = useTranslations('Admin.Organizations.Overview');
  const intlLocale = toIntlLocale(useLocale());
  const { data } = useAdminOrganizationsOverview();

  const num = (value: number) => value.toLocaleString(intlLocale);
  const money = (value: number, currency: 'MXN' | 'USD') =>
    new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);

  const toggle = (next: AdminOrganizationSegment | null) =>
    onSegmentChange(segment === next ? null : next);

  if (!data) return <OverviewCardsSkeleton />;

  const { organizations, mrr, attention, idle } = data;

  const attentionParts = [
    { count: attention.negativeBalance, label: t('negativeBalance') },
    { count: attention.lowCredits, label: t('lowCredits') },
    { count: attention.paymentIssue, label: t('paymentIssue') },
    { count: attention.manualRenewalDue, label: t('manualRenewalDue') },
  ].filter((part) => part.count > 0);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <OverviewCard
        icon={Building2}
        label={t('activeTitle')}
        value={num(organizations.active)}
        active={segment === null}
        onClick={() => onSegmentChange(null)}
        hint={t('activeHint', {
          paying: organizations.paying,
          free: organizations.free,
          inactive: organizations.inactive,
        })}
      />

      <OverviewCard
        icon={TrendingUp}
        label={t('mrrTitle')}
        color="var(--success-500)"
        value={money(mrr.mxn, 'MXN')}
        active={segment === 'paying'}
        onClick={() => toggle('paying')}
        hint={
          <>
            {mrr.usd > 0 && (
              <span className="block">{t('mrrUsd', { amount: money(mrr.usd, 'USD') })}</span>
            )}
            <span className="block">
              {t('mrrHint', { priced: mrr.priced, manual: mrr.manual })}
            </span>
            {mrr.unpriced > 0 && (
              <span className="block text-[var(--warning-text-adaptive)]">
                {t('mrrUnpriced', { count: mrr.unpriced })}
              </span>
            )}
          </>
        }
      />

      <OverviewCard
        icon={AlertTriangle}
        label={t('attentionTitle')}
        color={attention.total > 0 ? 'var(--danger-500)' : 'var(--success-500)'}
        value={num(attention.total)}
        active={segment === 'attention'}
        onClick={() => toggle('attention')}
        hint={
          attention.total === 0
            ? t('allGood')
            : attentionParts.map((part) => (
                <span key={part.label} className="block">
                  {part.count} {part.label}
                </span>
              ))
        }
      />

      <OverviewCard
        icon={Moon}
        label={t('idleTitle', { days: idle.days })}
        color={idle.total > 0 ? 'var(--warning-500)' : 'var(--success-500)'}
        value={num(idle.total)}
        active={segment === 'idle'}
        onClick={() => toggle('idle')}
        hint={idle.total === 0 ? t('idleNone') : t('idleHint', { days: idle.days })}
      />
    </div>
  );
}
