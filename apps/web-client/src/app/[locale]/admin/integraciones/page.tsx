'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { LogoLoader } from '@/components/ui/logo-loader';
import { InfiniteSelect } from '@/components/ui/infinite-select';
import { Link } from '@/i18n/routing';
import { useDebounce } from '@/hooks/use-debounce';
import { useInfiniteAdminOrganizations } from '@/hooks/automation/use-admin-workflows';
import { useAdminTenantTools } from '@/hooks/automation/use-admin-tenant-tools';
import {
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

const STATUS_STYLE: Record<string, string> = {
  CONNECTED: 'text-success-600',
  ERROR: 'text-danger',
  EXPIRED_AUTH: 'text-warning-600',
  DISCONNECTED: 'text-text-tertiary',
};

/**
 * Solo lectura: ubicar a qué organización (y qué workflows) pertenece una tenant tool a
 * partir de su id o nombre — no hay forma de saberlo desde /integrations, que resuelve
 * la organización desde el JWT de quien llama. Para crear/conectar/vincular una tool
 * sigue siendo el panel del cliente o el editor del workflow, esto es solo para
 * ubicarla cuando ya tenés el id (por ejemplo, para pegarlo en un workflow a mano).
 *
 * El filtro por organización no es solo comodidad: acota la lista antes de copiar un
 * id, para no terminar vinculando por error la tool de otra organización a un workflow.
 */
export default function AdminIntegracionesPage() {
  const t = useTranslations('Admin.Integrations');
  const [organizationId, setOrganizationId] = useState('');
  const [orgSearchInput, setOrgSearchInput] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const { pageSize, setPageSize } = usePageSize('admin-integrations');
  const [page, setPage] = useState(1);

  const search = useDebounce(searchInput, 400);
  const orgSearch = useDebounce(orgSearchInput, 400);

  useEffect(() => {
    setPage(1);
  }, [organizationId, search]);

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
      ...organizations.map((o) => ({ label: o.name, value: o.id })),
    ],
    [organizations, t],
  );

  const { data, isLoading, error } = useAdminTenantTools({
    organizationId: organizationId || undefined,
    search: search || undefined,
    page,
    limit: pageSize,
  });

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className={pageTitleClass}>{t('title')}</h1>
        <p className={pageSubtitleClass}>{t('subtitle')}</p>
      </div>

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
            {data.data.map((tool) => (
              <li key={tool.id} className={`${rowClass} px-4 py-3.5`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold text-text-primary">
                    {tool.displayName}
                  </span>
                  <span className={`text-xs ${STATUS_STYLE[tool.status] ?? 'text-text-tertiary'}`}>
                    {tool.status}
                  </span>
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
                  <span>{tool.toolCatalog.displayName}</span>
                  <Link
                    href={`/admin/organizaciones/${tool.organization.id}`}
                    className="hover:text-text-primary hover:underline"
                  >
                    {tool.organization.name}
                  </Link>
                  <span>{t('workflowsCount', { count: tool._count.workflows })}</span>
                </p>
                <p className="mt-1 font-mono text-[11px] text-text-tertiary">{tool.id}</p>
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
    </div>
  );
}
