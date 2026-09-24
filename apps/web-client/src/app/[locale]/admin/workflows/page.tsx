'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { toast } from 'sonner';
import { AnimatePresence } from 'framer-motion';
import { Search, Plus, History, Building2 } from 'lucide-react';
import { LogoLoader } from '@/components/ui/logo-loader';
import { InfiniteSelect } from '@/components/ui/infinite-select';
import { useDebounce } from '@/hooks/use-debounce';
import {
  useAdminWorkflows,
  useInfiniteAdminOrganizations,
} from '@/hooks/automation/use-admin-workflows';
import { btnPrimary, inputClass } from '../_styles';
import { PagePager } from '@/components/ui/page-pager';
import { usePageSize } from '@/hooks/shared/use-page-size';
import { CreateWorkflowModal } from '@/components/admin/workflows/create-workflow-modal';

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

  const search = useDebounce(searchInput, 400);
  const orgSearch = useDebounce(orgSearchInput, 400);

  useEffect(() => {
    setPage(1);
  }, [organizationId, search, includeDeleted]);

  const {
    data: orgPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: orgsLoading,
  } = useInfiniteAdminOrganizations({ search: orgSearch || undefined });

  const organizations = useMemo(
    () => orgPages?.pages.flatMap((p) => p.data) ?? [],
    [orgPages],
  );

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
    page,
    limit: pageSize,
  });

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">{t('title')}</h1>
          <p className="mt-1 text-sm text-text-secondary">{t('subtitle')}</p>
        </div>
        <button className={btnPrimary} onClick={() => setCreateOpen(true)}>
          <Plus size={16} />
          {t('newWorkflow')}
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
        <div className="relative min-w-[240px] flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
          />
          <input
            className={`${inputClass} pl-9`}
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
            {data.data.map((w) => (
              <li key={w.id}>
                <button
                  onClick={() => router.push(`/admin/workflows/${w.id}`)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-surface-secondary"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="truncate font-medium text-text-primary">{w.name}</span>
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
          className="mt-4"
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
