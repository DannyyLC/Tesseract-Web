'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AnimatePresence } from 'framer-motion';
import { Building2, Plus, Send, EyeOff } from 'lucide-react';
import { AnnouncementStatus } from '@tesseract/types';
import { LogoLoader } from '@/components/ui/logo-loader';
import { InfiniteSelect } from '@/components/ui/infinite-select';
import { PagePager } from '@/components/ui/page-pager';
import { useInfiniteAdminOrganizations } from '@/hooks/automation/use-admin-workflows';
import { useAdminAnnouncements, useAdminAnnouncementMutations } from '@/hooks/platform/use-admin-announcements';
import { CreateAnnouncementModal } from '@/components/admin/announcements/create-announcement-modal';
import { btnGhost, btnPrimary, inputClass } from '../_styles';

const STATUS_LABEL: Record<AnnouncementStatus, string> = {
  [AnnouncementStatus.DRAFT]: 'Borrador',
  [AnnouncementStatus.PUBLISHED]: 'Publicado',
  [AnnouncementStatus.EXPIRED]: 'Caducado',
  [AnnouncementStatus.UNPUBLISHED]: 'Despublicado',
};

const STATUS_CLASS: Record<AnnouncementStatus, string> = {
  [AnnouncementStatus.DRAFT]: 'text-text-tertiary',
  [AnnouncementStatus.PUBLISHED]: 'text-success',
  [AnnouncementStatus.EXPIRED]: 'text-text-secondary',
  [AnnouncementStatus.UNPUBLISHED]: 'text-danger',
};

export default function AdminAnnouncementsPage() {
  const [organizationId, setOrganizationId] = useState('');
  const [orgSearchInput, setOrgSearchInput] = useState('');
  const [status, setStatus] = useState<AnnouncementStatus | ''>('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

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
      { label: 'Todas las organizaciones', value: '' },
      ...organizations.map((o) => ({ label: o.name, value: o.id })),
    ],
    [organizations],
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
          <h1 className="text-xl font-semibold text-text-primary">Anuncios</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Comunica cambios importantes a todas las organizaciones o a una en particular.
          </p>
        </div>
        <button className={btnPrimary} onClick={() => setCreateOpen(true)}>
          <Plus size={16} />
          Nuevo anuncio
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
            searchValue={orgSearchInput}
            onSearchChange={setOrgSearchInput}
            searchPlaceholder="Buscar organización..."
          />
        </div>
        <select
          className={`${inputClass} max-w-[200px]`}
          value={status}
          onChange={(e) => setStatus(e.target.value as AnnouncementStatus | '')}
        >
          <option value="">Todos los estados</option>
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
            <LogoLoader text="Cargando anuncios" />
          </div>
        ) : error ? (
          <p className="px-4 py-10 text-center text-sm text-danger">No se pudieron cargar los anuncios.</p>
        ) : !data?.data.length ? (
          <p className="px-4 py-10 text-center text-sm text-text-secondary">No hay anuncios que coincidan.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.data.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate font-medium text-text-primary">{a.title}</span>
                    <span className="text-xs text-text-tertiary">
                      {a.template === 'CELEBRATION' ? 'celebración' : 'noticia'}
                    </span>
                    <span className={`text-xs font-medium ${STATUS_CLASS[a.status]}`}>
                      {STATUS_LABEL[a.status]}
                    </span>
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
                    <span className="inline-flex items-center gap-1">
                      <Building2 size={11} />
                      {a.targetOrganizationName ?? 'Todas las organizaciones'}
                    </span>
                    <span>{a.targetRoles.join(', ')}</span>
                    {a.createdByEmail && <span>por {a.createdByEmail}</span>}
                  </p>
                </div>

                <div className="hidden shrink-0 items-center gap-4 text-xs text-text-secondary md:flex">
                  <span>Entregados {a.metrics.delivered}</span>
                  <span>
                    Vistos {a.metrics.dismissed}
                    {a.metrics.delivered > 0
                      ? ` (${Math.round((a.metrics.dismissed / a.metrics.delivered) * 100)}%)`
                      : ''}
                  </span>
                  <span>
                    CTA {a.metrics.ctaClicked}
                    {a.metrics.delivered > 0
                      ? ` (${Math.round((a.metrics.ctaClicked / a.metrics.delivered) * 100)}%)`
                      : ''}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {a.status === AnnouncementStatus.DRAFT && (
                    <button
                      className={btnGhost}
                      disabled={publish.isPending}
                      onClick={() =>
                        publish.mutate(a.id, {
                          onSuccess: (result) => toast.success(`Enviado a ${result.delivered} usuario(s)`),
                          onError: (e: any) => !e?.toastHandled && toast.error(e?.message ?? 'No se pudo publicar'),
                        })
                      }
                    >
                      <Send size={14} />
                      Publicar
                    </button>
                  )}
                  {(a.status === AnnouncementStatus.PUBLISHED || a.status === AnnouncementStatus.EXPIRED) && (
                    <button
                      className={btnGhost}
                      disabled={unpublish.isPending}
                      onClick={() => {
                        if (!window.confirm('¿Despublicar este anuncio? Se retira del modal y de la campana.')) return;
                        unpublish.mutate(a.id, {
                          onError: (e: any) => !e?.toastHandled && toast.error(e?.message ?? 'No se pudo despublicar'),
                        });
                      }}
                    >
                      <EyeOff size={14} />
                      Despublicar
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
          summary={`Página ${data.meta.page} de ${data.meta.totalPages} · ${data.meta.total} anuncios`}
          className="mt-4"
        />
      )}

      <AnimatePresence>
        {createOpen && (
          <CreateAnnouncementModal
            onClose={() => setCreateOpen(false)}
            onCreated={(message) => {
              toast.success(message);
              setCreateOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
