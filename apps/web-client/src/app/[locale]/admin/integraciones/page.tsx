'use client';

import { useEffect, useMemo, useState } from 'react';
import { ADMIN_PAGE_SIZE } from '@tesseract/types';
import { Search } from 'lucide-react';
import { LogoLoader } from '@/components/ui/logo-loader';
import { InfiniteSelect } from '@/components/ui/infinite-select';
import { Link } from '@/i18n/routing';
import { useDebounce } from '@/hooks/use-debounce';
import { useInfiniteAdminOrganizations } from '@/hooks/automation/use-admin-workflows';
import { useAdminTenantTools } from '@/hooks/automation/use-admin-tenant-tools';
import { inputClass } from '../_styles';
import { PagePager } from '@/components/ui/page-pager';

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
  const [organizationId, setOrganizationId] = useState('');
  const [orgSearchInput, setOrgSearchInput] = useState('');
  const [searchInput, setSearchInput] = useState('');
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
      { label: 'Todas las organizaciones', value: '' },
      ...organizations.map((o) => ({ label: o.name, value: o.id })),
    ],
    [organizations],
  );

  const { data, isLoading, error } = useAdminTenantTools({
    organizationId: organizationId || undefined,
    search: search || undefined,
    page,
    limit: ADMIN_PAGE_SIZE,
  });

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Integraciones</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Tenant tools de todas las organizaciones — para ubicar a qué organización y qué
          workflows pertenece un id.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="min-w-[240px] flex-1">
          <InfiniteSelect
            value={organizationId}
            onChange={setOrganizationId}
            options={orgOptions}
            placeholder="Organización"
            isLoading={orgsLoading}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={fetchNextPage}
            searchValue={orgSearchInput}
            onSearchChange={setOrgSearchInput}
            searchPlaceholder="Buscar organización..."
          />
        </div>
        <div className="relative min-w-[240px] flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
          />
          <input
            className={`${inputClass} pl-9`}
            placeholder="Buscar por nombre o id"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
      </div>

      <section className="rounded-xl border border-border bg-surface">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <LogoLoader text="Cargando integraciones" />
          </div>
        ) : error ? (
          <p className="px-4 py-10 text-center text-sm text-danger">
            No se pudieron cargar las integraciones.
          </p>
        ) : !data?.data.length ? (
          <p className="px-4 py-10 text-center text-sm text-text-secondary">
            No hay integraciones que coincidan.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {data.data.map((tool) => (
              <li key={tool.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-text-primary">{tool.displayName}</span>
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
                  <span>
                    {tool._count.workflows} {tool._count.workflows === 1 ? 'workflow' : 'workflows'}
                  </span>
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
          summary={`Página ${data.meta.page} de ${data.meta.totalPages} · ${data.meta.total} integraciones`}
          className="mt-4"
        />
      )}
    </div>
  );
}
