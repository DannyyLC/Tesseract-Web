'use client';

import { useTranslations } from 'next-intl';
import { useAdminWhatsappOverview } from '@/hooks/billing/use-admin-analytics';
import { OverviewCard, OverviewCardsSkeleton } from '@/components/admin/overview-card';

/**
 * Panorama de WhatsApp de toda la plataforma, arriba de la página de plantillas (que trabaja
 * organización por organización). Solo informativo: no hay un listado global que filtrar.
 */
export function WhatsappOverviewCards() {
  const t = useTranslations('Admin.WbTemplates.Overview');
  const { data } = useAdminWhatsappOverview();

  if (!data) return <OverviewCardsSkeleton />;

  const { numbers, templates, conversations } = data;
  const providers = Object.entries(numbers.byProvider)
    .map(([provider, count]) => `${count} ${t(`providers.${provider}`)}`)
    .join(' · ');

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <OverviewCard
        label={t('connectedTitle')}
        color={numbers.connected > 0 ? 'var(--success-500)' : undefined}
        value={String(numbers.connected)}
        hint={t('connectedHint', { total: numbers.total, providers })}
      />
      <OverviewCard
        label={t('downTitle')}
        color={numbers.down > 0 ? 'var(--danger-500)' : 'var(--success-500)'}
        value={String(numbers.down)}
        hint={numbers.down > 0 ? t('downHint') : t('downNone')}
      />
      <OverviewCard
        label={t('templatesTitle')}
        value={String(templates.active)}
        hint={
          <>
            <span className="block">
              {t('templatesHint', { numbers: templates.numbersWithTemplates })}
            </span>
            {templates.connectedWithoutTemplates > 0 && (
              <span className="block text-[var(--warning-text-adaptive)]">
                {t('withoutTemplates', { count: templates.connectedWithoutTemplates })}
              </span>
            )}
          </>
        }
      />
      <OverviewCard
        label={t('conversationsTitle', { days: data.days })}
        value={String(conversations.total)}
        hint={t('conversationsHint', { numbers: conversations.numbers })}
      />
    </div>
  );
}
