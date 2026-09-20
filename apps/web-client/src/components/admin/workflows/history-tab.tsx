'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useLocale, useTranslations } from 'next-intl';
import { AnimatePresence } from 'framer-motion';
import { RotateCcw, Anchor, GitCompare } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { LogoLoader } from '@/components/ui/logo-loader';
import {
  useAdminWorkflowMutations,
  useVersionDiff,
  useWorkflowVersions,
} from '@/hooks/automation/use-admin-workflows';
import { useApiErrorMessage } from '@/hooks/shared/use-api-error-message';
import { toIntlLocale } from '@/lib/intl-locale';
import { btnGhost, btnPrimary, inputClass, labelClass } from '@/app/[locale]/admin/_styles';
import { PagePager } from '@/components/ui/page-pager';
import { usePageSize } from '@/hooks/shared/use-page-size';

interface Props {
  workflowId: string;
  currentVersion: number;
  hasUnsavedChanges: boolean;
}

export function HistoryTab({ workflowId, currentVersion, hasUnsavedChanges }: Props) {
  const t = useTranslations('Admin.HistoryTab');
  const intlLocale = toIntlLocale(useLocale());
  const getApiErrorMessage = useApiErrorMessage();
  const SOURCE_LABEL: Record<string, string> = {
    BASELINE: t('sourceBaseline'),
    ADMIN_UI: t('sourceAdminUi'),
    RESTORE: t('sourceRestore'),
    CLONE: t('sourceClone'),
  };
  const { pageSize, setPageSize } = usePageSize('admin-workflow-versions');
  const [page, setPage] = useState(1);
  const [diffVersionId, setDiffVersionId] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<{ id: string; version: number } | null>(null);
  const [restoreNote, setRestoreNote] = useState('');

  const { data, isLoading } = useWorkflowVersions(workflowId, page, true, pageSize);
  const { data: diff, isLoading: diffLoading } = useVersionDiff(workflowId, diffVersionId);
  const { restoreVersion } = useAdminWorkflowMutations();

  const handleRestore = () => {
    if (!restoreTarget) return;
    restoreVersion.mutate(
      {
        id: workflowId,
        versionId: restoreTarget.id,
        expectedVersion: currentVersion,
        note: restoreNote.trim() || undefined,
      },
      {
        onSuccess: (result) => {
          toast.success(
            result.changed
              ? t('restoredTo', {
                  version: restoreTarget.version,
                  savedVersion: result.workflow?.version ?? '',
                })
              : t('alreadyCurrent'),
          );
          setRestoreTarget(null);
          setRestoreNote('');
        },
        onError: (e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LogoLoader text={t('loading')} />
      </div>
    );
  }

  if (!data?.data.length) {
    return <p className="p-8 text-center text-sm text-text-secondary">{t('noVersions')}</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary">{t('retentionHint')}</p>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {data.data.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-text-primary">v{v.version}</span>
                {v.isBaseline && (
                  <span className="inline-flex items-center gap-1 rounded bg-surface-secondary px-1.5 py-0.5 text-[10px] text-text-secondary">
                    <Anchor size={10} /> {t('permanentBadge')}
                  </span>
                )}
                <span className="text-[11px] text-text-secondary">
                  {SOURCE_LABEL[v.source] ?? v.source}
                </span>
                {v.version === currentVersion && (
                  <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent">
                    {t('currentBadge')}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-text-secondary">
                {new Date(v.createdAt).toLocaleString(intlLocale)}
                {v.createdByEmail && ` · ${v.createdByEmail}`}
                {` · ${t('sizeKb', { size: Math.round(v.sizeBytes / 1024) })}`}
              </p>
              {v.note && <p className="mt-0.5 text-xs text-text-primary">{v.note}</p>}
            </div>

            <div className="flex gap-2">
              <button
                className={btnGhost}
                onClick={() => setDiffVersionId(v.id)}
                title={t('compareTitle')}
              >
                <GitCompare size={13} /> {t('compare')}
              </button>
              <button
                className={btnGhost}
                disabled={v.version === currentVersion}
                onClick={() => setRestoreTarget({ id: v.id, version: v.version })}
              >
                <RotateCcw size={13} /> {t('restore')}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <PagePager
        page={data.meta.page}
        totalPages={data.meta.totalPages}
        onPageChange={setPage}
        pageSize={pageSize}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        summary={t('pagerSummary', { page: data.meta.page, totalPages: data.meta.totalPages })}
      />

      <AnimatePresence>
        {diffVersionId && (
          <Modal isOpen onClose={() => setDiffVersionId(null)} title={t('compareModalTitle')}>
            {diffLoading ? (
              <div className="flex justify-center py-8">
                <LogoLoader text={t('calculatingDiff')} />
              </div>
            ) : !diff?.entries.length ? (
              <p className="py-6 text-center text-sm text-text-secondary">{t('noDiff')}</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-text-secondary">
                  {t('diffSummary', {
                    from: diff.fromVersion,
                    to: diff.toVersion,
                    count: diff.entries.length,
                  })}
                </p>
                {diff.entries.map((entry, i) => (
                  <div key={i} className="rounded-lg border border-border p-2">
                    <p className="font-mono text-[11px] text-text-primary">{entry.path}</p>
                    <p className="text-[10px] uppercase text-text-secondary">{entry.op}</p>
                    {entry.op !== 'added' && (
                      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-surface-secondary p-2 font-mono text-[11px] text-text-secondary">
                        − {typeof entry.before === 'string' ? entry.before : JSON.stringify(entry.before)}
                      </pre>
                    )}
                    {entry.op !== 'removed' && (
                      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-surface-secondary p-2 font-mono text-[11px] text-text-primary">
                        + {typeof entry.after === 'string' ? entry.after : JSON.stringify(entry.after)}
                      </pre>
                    )}
                    {entry.truncated && (
                      <p className="mt-1 text-[10px] text-text-secondary">
                        {t('truncatedValue')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Modal>
        )}

        {restoreTarget && (
          <Modal
            isOpen
            onClose={() => setRestoreTarget(null)}
            title={t('restoreModalTitle', { version: restoreTarget.version })}
          >
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                {t('restoreExplanation', { version: restoreTarget.version })}
              </p>
              {hasUnsavedChanges && (
                <p className="rounded-lg border border-danger/40 px-3 py-2 text-xs text-danger">
                  {t('unsavedWarning')}
                </p>
              )}
              <div>
                <label className={labelClass}>{t('noteLabel')}</label>
                <input
                  className={inputClass}
                  value={restoreNote}
                  onChange={(e) => setRestoreNote(e.target.value)}
                  placeholder={t('notePlaceholder')}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button className={btnGhost} onClick={() => setRestoreTarget(null)}>
                  {t('cancel')}
                </button>
                <button
                  className={btnPrimary}
                  onClick={handleRestore}
                  disabled={restoreVersion.isPending}
                >
                  {restoreVersion.isPending ? t('restoring') : t('restore')}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
