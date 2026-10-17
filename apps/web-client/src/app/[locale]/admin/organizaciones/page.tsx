'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Search, X } from 'lucide-react';
import { LogoLoader } from '@/components/ui/logo-loader';
import { useDebounce } from '@/hooks/use-debounce';
import { useAdminOrganizations } from '@/hooks/identity/use-admin-organizations';
import { OrganizationSummary } from '@/components/admin/organizations/organization-summary';
import { OrganizationsOverviewCards } from '@/components/admin/organizations/organizations-overview-cards';
import type { AdminOrganizationSegment } from '@/lib/api/endpoints/identity/organizations/organizations-admin-api';
import {
  emptyClass,
  pageSubtitleClass,
  pageTitleClass,
  rowClass,
  searchClass,
  searchIconClass,
  segmentedItemClass,
  segmentedTrackClass,
} from '../_styles';
import { PagePager } from '@/components/ui/page-pager';
import { usePageSize } from '@/hooks/shared/use-page-size';

export default function AdminOrganizationsPage() {
  const t = useTranslations('Admin.Organizations');
  const STATUS_FILTERS = [
    { label: t('statusAll'), value: '' },
    { label: t('statusActive'), value: 'true' },
    { label: t('statusInactive'), value: 'false' },
  ] as const;
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]['value']>('');
  const { pageSize, setPageSize } = usePageSize('admin-organizations');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [segment, setSegment] = useState<AdminOrganizationSegment | null>(null);

  const search = useDebounce(searchInput, 400);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, segment]);

  const { data, isLoading, error } = useAdminOrganizations({
    search: search || undefined,
    isActive: statusFilter === '' ? undefined : statusFilter === 'true',
    segment: segment ?? undefined,
    page,
    limit: pageSize,
  });

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className={pageTitleClass}>{t('title')}</h1>
        <p className={pageSubtitleClass}>{t('subtitle')}</p>
      </div>

      <OrganizationsOverviewCards segment={segment} onSegmentChange={setSegment} />

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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className={searchIconClass} />
          <input
            className={searchClass}
            placeholder={t('searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className={segmentedTrackClass}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={segmentedItemClass(statusFilter === f.value)}
            >
              {f.label}
            </button>
          ))}
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
            {data.data.map((org) => {
              const isExpanded = expandedId === org.id;
              return (
                // Expandida se queda enmarcada solo con borde (sin el fondo gris de
                // `rowActiveClass`) para que el resumen, que ya tiene sus propias tarjetas,
                // no quede sobre un panel de otro tono.
                <li
                  key={org.id}
                  className={isExpanded ? 'rounded-xl border border-border' : rowClass}
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : org.id)}
                    aria-expanded={isExpanded}
                    className="flex w-full items-center gap-4 px-4 py-3.5 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold text-text-primary">{org.name}</span>
                        {!org.isActive && (
                          <span className="text-xs text-danger">{t('inactiveBadge')}</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-text-secondary">{org.slug}</p>
                    </div>
                    <ChevronDown
                      size={16}
                      className={`shrink-0 text-text-tertiary transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isExpanded && (
                    <div className="mx-4 border-t border-[var(--border-subtle)]">
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
