'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ADMIN_PAGE_SIZE } from '@tesseract/types';
import { ChevronDown, Search } from 'lucide-react';
import { LogoLoader } from '@/components/ui/logo-loader';
import { useDebounce } from '@/hooks/use-debounce';
import { useAdminOrganizations } from '@/hooks/identity/use-admin-organizations';
import { OrganizationSummary } from '@/components/admin/organizations/organization-summary';
import { inputClass } from '../_styles';
import { PagePager } from '@/components/ui/page-pager';

export default function AdminOrganizationsPage() {
  const t = useTranslations('Admin.Organizations');
  const STATUS_FILTERS = [
    { label: t('statusAll'), value: '' },
    { label: t('statusActive'), value: 'true' },
    { label: t('statusInactive'), value: 'false' },
  ] as const;
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]['value']>('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const search = useDebounce(searchInput, 400);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const { data, isLoading, error } = useAdminOrganizations({
    search: search || undefined,
    isActive: statusFilter === '' ? undefined : statusFilter === 'true',
    page,
    limit: ADMIN_PAGE_SIZE,
  });

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary">{t('title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('subtitle')}</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
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
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                statusFilter === f.value
                  ? 'bg-surface-secondary font-medium text-text-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
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
            {data.data.map((org) => {
              const isExpanded = expandedId === org.id;
              return (
                <li key={org.id}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : org.id)}
                    aria-expanded={isExpanded}
                    className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-surface-secondary"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-text-primary">{org.name}</span>
                        {!org.isActive && (
                          <span className="text-xs text-danger">{t('inactiveBadge')}</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-text-secondary">{org.slug}</p>
                    </div>
                    <ChevronDown
                      size={16}
                      className={`shrink-0 text-text-secondary transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border px-4">
                      <OrganizationSummary organizationId={org.id} />
                    </div>
                  )}
                </li>
              );
            })}
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
    </div>
  );
}
