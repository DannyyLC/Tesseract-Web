'use client';

import { useTranslations } from 'next-intl';
import { AnnouncementStatus } from '@tesseract/types';
import { useAdminAnnouncementsOverview } from '@/hooks/platform/use-admin-announcements';
import { OverviewCard, OverviewCardsSkeleton } from '@/components/admin/overview-card';

interface Props {
  status: AnnouncementStatus | '';
  onStatusChange: (status: AnnouncementStatus | '') => void;
}

const pct = (part: number, total: number) =>
  total > 0 ? `${Math.round((part / total) * 100)}%` : '—';

/**
 * Arriba del listado de anuncios: los dos estados que piden acción (publicados y borradores),
 * que filtran el listado con el mismo selector de estado, y si los anuncios se leen y se les da
 * clic, que es lo único que dice si sirvieron.
 */
export function AnnouncementsOverviewCards({ status, onStatusChange }: Props) {
  const t = useTranslations('Admin.Announcements.Overview');
  const { data } = useAdminAnnouncementsOverview();

  if (!data) return <OverviewCardsSkeleton />;

  const toggle = (next: AnnouncementStatus) => onStatusChange(status === next ? '' : next);
  const { status: counts, engagement } = data;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <OverviewCard
        label={t('publishedTitle')}
        color={counts.published > 0 ? 'var(--success-500)' : undefined}
        value={String(counts.published)}
        active={status === AnnouncementStatus.PUBLISHED}
        onClick={() => toggle(AnnouncementStatus.PUBLISHED)}
        hint={t('publishedHint', { expired: counts.expired, unpublished: counts.unpublished })}
      />
      <OverviewCard
        label={t('draftTitle')}
        color={counts.draft > 0 ? 'var(--warning-500)' : undefined}
        value={String(counts.draft)}
        active={status === AnnouncementStatus.DRAFT}
        onClick={() => toggle(AnnouncementStatus.DRAFT)}
        hint={counts.draft > 0 ? t('draftHint') : t('draftNone')}
      />
      <OverviewCard
        label={t('readTitle', { days: engagement.days })}
        value={pct(engagement.read, engagement.delivered)}
        hint={
          engagement.delivered > 0
            ? t('readHint', {
                read: engagement.read,
                delivered: engagement.delivered,
                dismissed: engagement.dismissed,
              })
            : t('noDeliveries')
        }
      />
      <OverviewCard
        label={t('ctaTitle', { days: engagement.days })}
        value={pct(engagement.ctaClicked, engagement.ctaDelivered)}
        hint={
          engagement.ctaDelivered > 0
            ? t('ctaHint', { clicked: engagement.ctaClicked, delivered: engagement.ctaDelivered })
            : t('ctaNone')
        }
      />
    </div>
  );
}
