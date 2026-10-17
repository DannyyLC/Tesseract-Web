'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { toast } from 'sonner';
import { AnimatePresence } from 'framer-motion';
import { Search, Plus, History, Building2, X } from 'lucide-react';
import { LogoLoader } from '@/components/ui/logo-loader';
import { InfiniteSelect } from '@/components/ui/infinite-select';
import { useDebounce } from '@/hooks/use-debounce';
import {
  useAdminWorkflows,
  useInfiniteAdminOrganizations,
} from '@/hooks/automation/use-admin-workflows';
import {
  btnPrimary,
  emptyClass,
  filterSelectClass,
  pageSubtitleClass,
  pageTitleClass,
  rowClass,
  searchClass,
  searchIconClass,
} from '../_styles';
import { PagePager } from '@/components/ui/page-pager';
import { usePageSize } from '@/hooks/shared/use-page-size';
import { CreateWorkflowModal } from '@/components/admin/workflows/create-workflow-modal';
import { WorkflowsOverviewCards } from '@/components/admin/workflows/workflows-overview-cards';
import type { AdminWorkflowSegment } from '@/lib/api/endpoints/automation/workflows/workflows-admin-api';

export default function AdminWorkflowsPage() {
  const t = useTranslations('Admin.Workflows');
  const router = useRouter();

  const [organizationId, setOrganizationId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [orgSearchInput, setOrgSearchInput] = useState('');
  const { pageSize, setPageSize } = usePageSize('admin-workflows');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [segment, setSegment] = useState<AdminWorkflowSegment | null>(null);

  const search = useDebounce(searchInput, 400);
  const orgSearch = useDebounce(orgSearchInput, 400);

  useEffect(() => {
    setPage(1);
  }, [organizationId, search, includeDeleted, segment]);

  const {
    data: orgPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: orgsLoading,
  } = useInfiniteAdminOrganizations({ search: orgSearch || undefined });

  const organizations = useMemo(() => orgPages?.pages.flatMap((p) => p.data) ?? [], [orgPages]);

  const orgOptions = useMemo(
    () => [
      { label: t('allOrganizations'), value: '' },
      ...organizations.map((o) => ({
        label: `${o.name} (${o._count.workflows})`,
        value: o.id,
      })),
    ],
    [organizations, t],
  );

  const { data, isLoading, error } = useAdminWorkflows({
    organizationId: organizationId || undefined,
    search: search || undefined,
    includeDeleted,
    segment: segment ?? undefined,
    page,
    limit: pageSize,
  });

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={pageTitleClass}>{t('title')}</h1>
          <p className={pageSubtitleClass}>{t('subtitle')}</p>
        </div>
        <button className={btnPrimary} onClick={() => setCreateOpen(true)}>
          <Plus size={16} />
          {t('newWorkflow')}
        </button>
      </div>

      <WorkflowsOverviewCards segment={segment} onSegmentChange={setSegment} />

      {segment && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
          {t('filteringBy', { segment: t(`Overview.segments.${segment}`) })}
          <button
            onClick={() => setSegment(null)}
            className="inline-flex items-center gap-1 text-text-primary underline-offset-2 hover:underline"
          >
            <X size={14} /> {t('clearSegment')}
          </button>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[240px] flex-1">
          <InfiniteSelect
            triggerClassName={filterSelectClass}
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
        <div className="relative min-w-[240px] flex-1">
          <Search size={16} className={searchIconClass} />
          <input
            className={searchClass}
            placeholder={t('searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(e) => setIncludeDeleted(e.target.checked)}
            className="h-4 w-4 shrink-0 accent-accent"
          />
          {t('includeDeleted')}
        </label>
      </div>

      <section>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <LogoLoader text={t('loading')} />
          </div>
        ) : error ? (
          <p className={`${emptyClass} text-danger`}>{t('loadError')}</p>
        ) : !data?.data.length ? (
          <p className={emptyClass}>{t('empty')}</p>
        ) : (
          <ul className="space-y-1">
            {data.data.map((w) => (
              <li key={w.id}>
                <button
                  onClick={() => router.push(`/admin/workflows/${w.id}`)}
                  className={`${rowClass} flex w-full items-center gap-4 px-4 py-3.5 text-left`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="truncate font-semibold text-text-primary">{w.name}</span>
                      {w.deletedAt ? (
                        <span className="text-xs text-danger">{t('deletedBadge')}</span>
                      ) : w.isPaused ? (
                        <span className="text-xs text-text-tertiary">{t('pausedBadge')}</span>
                      ) : (
                        !w.isActive && (
                          <span className="text-xs text-text-tertiary">{t('inactiveBadge')}</span>
                        )
                      )}
                      {w.isInternal && (
                        <span className="text-xs text-text-tertiary">{t('internalBadge')}</span>
                      )}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
                      <span className="inline-flex items-center gap-1">
                        <Building2 size={11} />
                        {w.organization.name}
                      </span>
                      <span>{w.category}</span>
                    </p>
                  </div>

                  <div className="hidden shrink-0 items-center gap-4 text-xs text-text-secondary md:flex">
                    <span>v{w.version}</span>
                    <span className="inline-flex items-center gap-1">
                      <History size={11} />
                      {w._count.configVersions}
                    </span>
                    <span>{t('executionsCount', { count: w.totalExecutions })}</span>
                  </div>
                </button>
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
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          summary={t('pagerSummary', {
            page: data.meta.page,
            totalPages: data.meta.totalPages,
            total: data.meta.total,
          })}
        />
      )}

      <AnimatePresence>
        {createOpen && (
          <CreateWorkflowModal
            organizations={organizations}
            onClose={() => setCreateOpen(false)}
            onCreated={(id, message) => {
              toast.success(message);
              setCreateOpen(false);
              router.push(`/admin/workflows/${id}`);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
