'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Building2, Plus, Send, EyeOff } from 'lucide-react';
import { AdminAnnouncementDto, AnnouncementStatus } from '@tesseract/types';
import { useRouter } from '@/i18n/routing';
import { LogoLoader } from '@/components/ui/logo-loader';
import { InfiniteSelect } from '@/components/ui/infinite-select';
import { PagePager } from '@/components/ui/page-pager';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { useInfiniteAdminOrganizations } from '@/hooks/automation/use-admin-workflows';
import { useAdminAnnouncements, useAdminAnnouncementMutations } from '@/hooks/platform/use-admin-announcements';
import { useApiErrorMessage } from '@/hooks/shared/use-api-error-message';
import { btnGhost, btnPrimary, inputClass } from '../_styles';

const STATUS_CLASS: Record<AnnouncementStatus, string> = {
  [AnnouncementStatus.DRAFT]: 'text-text-tertiary',
  [AnnouncementStatus.PUBLISHED]: 'text-success',
  [AnnouncementStatus.EXPIRED]: 'text-text-secondary',
  [AnnouncementStatus.UNPUBLISHED]: 'text-danger',
};

export default function AdminAnnouncementsPage() {
  const t = useTranslations('Admin.Announcements');
  const getApiErrorMessage = useApiErrorMessage();
  const router = useRouter();

  const STATUS_LABEL: Record<AnnouncementStatus, string> = {
    [AnnouncementStatus.DRAFT]: t('statusDraft'),
    [AnnouncementStatus.PUBLISHED]: t('statusPublished'),
    [AnnouncementStatus.EXPIRED]: t('statusExpired'),
    [AnnouncementStatus.UNPUBLISHED]: t('statusUnpublished'),
  };

  const targetLabel = (a: AdminAnnouncementDto): string => {
    if (a.targetOrganizations.length === 0) return t('allOrganizations');
    if (a.targetOrganizations.length <= 2) return a.targetOrganizations.map((o) => o.name).join(', ');
    return t('multipleOrgs', { count: a.targetOrganizations.length });
  };
  const [organizationId, setOrganizationId] = useState('');
  const [orgSearchInput, setOrgSearchInput] = useState('');
  const [status, setStatus] = useState<AnnouncementStatus | ''>('');
  const [page, setPage] = useState(1);
  const [pendingPublish, setPendingPublish] = useState<AdminAnnouncementDto | null>(null);
  const [pendingUnpublish, setPendingUnpublish] = useState<AdminAnnouncementDto | null>(null);

  useEffect(() => {
    setPage(1);
  }, [organizationId, status]);

  const {
    data: orgPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: orgsLoading,
  } = useInfiniteAdminOrganizations({ search: orgSearchInput || undefined });

  const organizations = useMemo(() => orgPages?.pages.flatMap((p) => p.data) ?? [], [orgPages]);
  const orgOptions = useMemo(
    () => [
      { label: t('allOrganizations'), value: '' },
      ...organizations.map((o) => ({ label: o.name, value: o.id })),
    ],
    [organizations, t],
  );

  const { data, isLoading, error } = useAdminAnnouncements({
    organizationId: organizationId || undefined,
    status: status || undefined,
    page,
  });

  const { publish, unpublish } = useAdminAnnouncementMutations();

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{t('title')}</h1>
          <p className="mt-1 text-sm text-text-secondary">{t('subtitle')}</p>
        </div>
        <button className={btnPrimary} onClick={() => router.push('/admin/anuncios/nuevo')}>
          <Plus size={16} />
          {t('newAnnouncement')}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="min-w-[240px] flex-1">
          <InfiniteSelect
            value={organizationId}
            onChange={setOrganizationId}
            options={orgOptions}
            placeholder={t('orgFilterPlaceholder')}
            isLoading={orgsLoading}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={fetchNextPage}
            searchValue={orgSearchInput}
            onSearchChange={setOrgSearchInput}
            searchPlaceholder={t('orgSearchPlaceholder')}
          />
        </div>
        <select
          className={`${inputClass} max-w-[200px]`}
          value={status}
          onChange={(e) => setStatus(e.target.value as AnnouncementStatus | '')}
        >
          <option value="">{t('allStatuses')}</option>
          {Object.values(AnnouncementStatus).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <section className="rounded-xl border border-border bg-surface">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <LogoLoader text={t('loading')} />
          </div>
        ) : error ? (
          <p className="px-4 py-10 text-center text-sm text-danger">{t('loadError')}</p>
        ) : !data?.data.length ? (
          <p className="px-4 py-10 text-center text-sm text-text-secondary">{t('empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.data.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate font-medium text-text-primary">{a.title}</span>
                    <span className="text-xs text-text-tertiary">
                      {a.template === 'CELEBRATION' ? t('templateCelebration') : t('templateNews')}
                    </span>
                    <span className={`text-xs font-medium ${STATUS_CLASS[a.status]}`}>
                      {STATUS_LABEL[a.status]}
                    </span>
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
                    <span className="inline-flex items-center gap-1">
                      <Building2 size={11} />
                      {targetLabel(a)}
                    </span>
                    <span>{a.targetRoles.join(', ')}</span>
                    {a.createdByEmail && <span>{t('byAuthor', { email: a.createdByEmail })}</span>}
                  </p>
                </div>

                <div className="hidden shrink-0 items-center gap-4 text-xs text-text-secondary md:flex">
                  <span>{t('delivered', { count: a.metrics.delivered })}</span>
                  <span>
                    {a.metrics.delivered > 0
                      ? t('viewedPct', {
                          count: a.metrics.dismissed,
                          pct: Math.round((a.metrics.dismissed / a.metrics.delivered) * 100),
                        })
                      : t('viewed', { count: a.metrics.dismissed })}
                  </span>
                  <span>
                    {a.metrics.delivered > 0
                      ? t('ctaClicksPct', {
                          count: a.metrics.ctaClicked,
                          pct: Math.round((a.metrics.ctaClicked / a.metrics.delivered) * 100),
                        })
                      : t('ctaClicks', { count: a.metrics.ctaClicked })}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {a.status === AnnouncementStatus.DRAFT && (
                    <button className={btnGhost} disabled={publish.isPending} onClick={() => setPendingPublish(a)}>
                      <Send size={14} />
                      {t('publish')}
                    </button>
                  )}
                  {(a.status === AnnouncementStatus.PUBLISHED || a.status === AnnouncementStatus.EXPIRED) && (
                    <button className={btnGhost} disabled={unpublish.isPending} onClick={() => setPendingUnpublish(a)}>
                      <EyeOff size={14} />
                      {t('unpublish')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data && (
        <PagePager
          page={data.meta.page}
          totalPages={data.meta.totalPages}
          onPageChange={setPage}
          summary={t('pagerSummary', {
            page: data.meta.page,
            totalPages: data.meta.totalPages,
            total: data.meta.total,
          })}
          className="mt-4"
        />
      )}

      <ConfirmModal
        isOpen={!!pendingPublish}
        onClose={() => setPendingPublish(null)}
        variant="warning"
        title={t('publishModalTitle')}
        message={
          pendingPublish
            ? t('publishModalMessage', {
                title: pendingPublish.title,
                target: targetLabel(pendingPublish).toLowerCase(),
                roles: pendingPublish.targetRoles.join(', '),
              })
            : ''
        }
        confirmLabel={t('publish')}
        onConfirm={async () => {
          if (!pendingPublish) return;
          await publish.mutateAsync(pendingPublish.id, {
            onSuccess: (result) => toast.success(t('sentToUsers', { count: result.delivered })),
            onError: (e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)),
          });
          setPendingPublish(null);
        }}
      />

      <ConfirmModal
        isOpen={!!pendingUnpublish}
        onClose={() => setPendingUnpublish(null)}
        variant="danger"
        title={t('unpublishModalTitle')}
        message={
          pendingUnpublish ? t('unpublishModalMessage', { title: pendingUnpublish.title }) : ''
        }
        confirmLabel={t('unpublish')}
        onConfirm={async () => {
          if (!pendingUnpublish) return;
          await unpublish.mutateAsync(pendingUnpublish.id, {
            onError: (e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)),
          });
          setPendingUnpublish(null);
        }}
      />
    </div>
  );
}
