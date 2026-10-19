'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, Link2, Loader2, Search, Unlink } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { DynamicIcon } from '@/components/ui/dynamic-icon';
import { LogoLoader } from '@/components/ui/logo-loader';
import { PagePager } from '@/components/ui/page-pager';
import { useDebounce } from '@/hooks/use-debounce';
import { usePageSize } from '@/hooks/shared/use-page-size';
import { useApiErrorMessage } from '@/hooks/shared/use-api-error-message';
import {
  useAdminWorkflowIntegrations,
  useWorkflowIntegrationMutations,
} from '@/hooks/automation/use-admin-workflows';
import type {
  AdminWorkflowDetail,
  AdminWorkflowIntegration,
  WorkflowIntegrationFilter,
} from '@/lib/api/endpoints/automation/workflows/workflows-admin-api';
import {
  btnDangerGhost,
  btnPrimary,
  dangerBannerClass,
  emptyClass,
  searchClass,
  searchIconClass,
} from '@/app/[locale]/admin/_styles';
import { isToastHandled } from '@/lib/api/api-error';

interface Props {
  workflow: AdminWorkflowDetail;
}

const FILTERS: WorkflowIntegrationFilter[] = ['all', 'linked', 'unlinked'];

const STATUS_STYLE: Record<string, string> = {
  CONNECTED: 'text-success-600',
  ERROR: 'text-danger',
  EXPIRED_AUTH: 'text-warning-600',
  DISCONNECTED: 'text-text-tertiary',
};

/**
 * Vincula integraciones (tenant tools) al workflow. La lista la acota el servidor a la
 * organización del workflow: aquí no hay selector de organización a propósito, para que
 * no se pueda vincular por error la integración de otro cliente.
 *
 * No toca el borrador del config: vincular escribe la relación al instante. Que un agente
 * la use (su id en `agents[x].tools`) sigue siendo cosa del config.
 */
export function IntegrationsTab({ workflow }: Props) {
  const t = useTranslations('Admin.WorkflowEditor.integrations');
  const getApiErrorMessage = useApiErrorMessage();
  const [searchInput, setSearchInput] = useState('');
  const [filter, setFilter] = useState<WorkflowIntegrationFilter>('all');
  const { pageSize, setPageSize } = usePageSize('admin-workflow-integrations');
  const [page, setPage] = useState(1);
  const [toUnlink, setToUnlink] = useState<AdminWorkflowIntegration | null>(null);
  const [staleReferences, setStaleReferences] = useState<{ name: string; paths: string[] } | null>(
    null,
  );

  const search = useDebounce(searchInput, 400);

  useEffect(() => {
    setPage(1);
  }, [search, filter]);

  const { data, isLoading, error } = useAdminWorkflowIntegrations(workflow.id, {
    search: search || undefined,
    filter,
    page,
    limit: pageSize,
  });
  const { link, unlink } = useWorkflowIntegrationMutations(workflow.id);
  const busy = link.isPending || unlink.isPending;
  const isDeleted = !!workflow.deletedAt;

  const handleLink = (tool: AdminWorkflowIntegration) => {
    link.mutate(tool.id, {
      onSuccess: () => toast.success(t('linked', { name: tool.displayName })),
      onError: (e) => !isToastHandled(e) && toast.error(getApiErrorMessage(e)),
    });
  };

  const handleUnlink = async () => {
    if (!toUnlink) return;
    const tool = toUnlink;
    setToUnlink(null);
    try {
      const result = await unlink.mutateAsync(tool.id);
      toast.success(t('unlinked', { name: tool.displayName }));
      setStaleReferences(
        result.stillReferencedIn.length > 0
          ? { name: tool.displayName, paths: result.stillReferencedIn }
          : null,
      );
    } catch (e) {
      if (!isToastHandled(e)) toast.error(getApiErrorMessage(e));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-text-primary">
          {t('title', { organization: data?.organization.name ?? workflow.organization.name })}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">{t('subtitle')}</p>
      </div>

      {isDeleted && (
        <p className="flex items-center gap-1.5 text-sm text-danger">
          <AlertTriangle size={14} /> {t('deletedWorkflow')}
        </p>
      )}

      {staleReferences && (
        <div className={`${dangerBannerClass} space-y-1`}>
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <AlertTriangle size={13} />
            {t('staleReferences', { name: staleReferences.name })}
          </p>
          {staleReferences.paths.map((path) => (
            <p key={path} className="font-mono text-[11px]">
              · {path}
            </p>
          ))}
          <button
            onClick={() => setStaleReferences(null)}
            className="text-[11px] underline-offset-2 hover:underline"
          >
            {t('dismiss')}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={16} className={searchIconClass} />
          <input
            className={searchClass}
            placeholder={t('searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-4 text-sm" role="group" aria-label={t('filterLabel')}>
          {FILTERS.map((value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={
                filter === value
                  ? 'font-medium text-text-primary underline underline-offset-4'
                  : 'text-text-secondary hover:text-text-primary'
              }
            >
              {t(`filters.${value}`)}
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
          <p className={`${emptyClass} text-danger`}>{getApiErrorMessage(error)}</p>
        ) : !data?.data.length ? (
          <p className={emptyClass}>{search || filter !== 'all' ? t('noResults') : t('empty')}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {data.data.map((tool) => (
              <li
                key={tool.id}
                className="flex items-start gap-3 rounded-xl border border-border p-4"
              >
                <div className="mt-0.5 shrink-0 text-text-secondary">
                  <DynamicIcon name={tool.toolCatalog.icon} size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-text-primary">{tool.displayName}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
                    <span>{tool.toolCatalog.displayName}</span>
                    <span className={STATUS_STYLE[tool.status] ?? 'text-text-tertiary'}>
                      {t(`status.${tool.status}`)}
                    </span>
                    <span>{t('workflowsCount', { count: tool.workflowCount })}</span>
                  </p>
                  {tool.linked && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-success-600">
                      <CheckCircle2 size={13} /> {t('linkedLabel')}
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  {tool.linked ? (
                    <button
                      className={btnDangerGhost}
                      disabled={busy}
                      onClick={() => setToUnlink(tool)}
                    >
                      {unlink.isPending && unlink.variables === tool.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Unlink size={14} />
                      )}
                      {t('unlink')}
                    </button>
                  ) : (
                    <button
                      className={btnPrimary}
                      disabled={busy || isDeleted}
                      onClick={() => handleLink(tool)}
                    >
                      {link.isPending && link.variables === tool.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Link2 size={14} />
                      )}
                      {t('link')}
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
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          summary={t('pagerSummary', {
            page: data.meta.page,
            totalPages: Math.max(data.meta.totalPages, 1),
            total: data.meta.total,
          })}
        />
      )}

      <ConfirmModal
        isOpen={!!toUnlink}
        onClose={() => setToUnlink(null)}
        onConfirm={handleUnlink}
        variant="danger"
        title={t('unlinkTitle')}
        message={t('unlinkMessage', { name: toUnlink?.displayName ?? '' })}
        confirmLabel={t('unlink')}
      />
    </div>
  );
}
