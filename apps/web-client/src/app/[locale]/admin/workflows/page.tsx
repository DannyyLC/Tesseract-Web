'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { toast } from 'sonner';
import { AnimatePresence } from 'framer-motion';
import { Search, Plus, Pause, PowerOff, History, Building2 } from 'lucide-react';
import { LogoLoader } from '@/components/ui/logo-loader';
import { InfiniteSelect } from '@/components/ui/infinite-select';
import { useDebounce } from '@/hooks/use-debounce';
import {
  useAdminWorkflows,
  useInfiniteAdminOrganizations,
} from '@/hooks/automation/use-admin-workflows';
import { btnGhost, btnPrimary, inputClass } from '../_styles';
import { CreateWorkflowModal } from '@/components/admin/workflows/create-workflow-modal';

export default function AdminWorkflowsPage() {
  const router = useRouter();

  const [organizationId, setOrganizationId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const search = useDebounce(searchInput, 400);

  useEffect(() => {
    setPage(1);
  }, [organizationId, search]);

  const {
    data: orgPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: orgsLoading,
  } = useInfiniteAdminOrganizations();

  const organizations = useMemo(
    () => orgPages?.pages.flatMap((p) => p.data) ?? [],
    [orgPages],
  );

  const orgOptions = useMemo(
    () => [
      { label: 'Todas las organizaciones', value: '' },
      ...organizations.map((o) => ({
        label: `${o.name} (${o._count.workflows})`,
        value: o.id,
      })),
    ],
    [organizations],
  );

  const { data, isLoading, error } = useAdminWorkflows({
    organizationId: organizationId || undefined,
    search: search || undefined,
    page,
    limit: 20,
  });

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Workflows</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Edita la configuración de los workflows de cualquier cliente.
          </p>
        </div>
        <button className={btnPrimary} onClick={() => setCreateOpen(true)}>
          <Plus size={16} />
          Nuevo workflow
        </button>
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
          />
        </div>
        <div className="relative min-w-[240px] flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
          />
          <input
            className={`${inputClass} pl-9`}
            placeholder="Buscar por nombre o descripción"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
      </div>

      <section className="rounded-xl border border-border bg-surface">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <LogoLoader text="Cargando workflows" />
          </div>
        ) : error ? (
          <p className="px-4 py-10 text-center text-sm text-danger">
            No se pudieron cargar los workflows.
          </p>
        ) : !data?.data.length ? (
          <p className="px-4 py-10 text-center text-sm text-text-secondary">
            No hay workflows que coincidan.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {data.data.map((w) => (
              <li key={w.id}>
                <button
                  onClick={() => router.push(`/admin/workflows/${w.id}`)}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-surface-secondary"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-text-primary">{w.name}</span>
                      <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase text-text-secondary">
                        {w.category}
                      </span>
                      {!w.isActive && (
                        <span className="inline-flex items-center gap-1 rounded bg-surface-secondary px-1.5 py-0.5 text-[10px] text-text-secondary">
                          <PowerOff size={10} /> inactivo
                        </span>
                      )}
                      {w.isPaused && (
                        <span className="inline-flex items-center gap-1 rounded bg-surface-secondary px-1.5 py-0.5 text-[10px] text-text-secondary">
                          <Pause size={10} /> pausado
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
                      <span className="inline-flex items-center gap-1">
                        <Building2 size={11} />
                        {w.organization.name}
                      </span>
                      <span>v{w.version}</span>
                      <span className="inline-flex items-center gap-1">
                        <History size={11} />
                        {w._count.configVersions} versiones guardadas
                      </span>
                      <span>{w.totalExecutions} ejecuciones</span>
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data && data.meta.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
          <span>
            Página {data.meta.page} de {data.meta.totalPages} · {data.meta.total} workflows
          </span>
          <div className="flex gap-2">
            <button
              className={btnGhost}
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </button>
            <button
              className={btnGhost}
              disabled={page >= data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </button>
          </div>
        </div>
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
