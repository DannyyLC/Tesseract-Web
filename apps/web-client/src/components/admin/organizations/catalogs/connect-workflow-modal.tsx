'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DEFAULT_PAGE_SIZE } from '@tesseract/types';
import { Check, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminWorkflows } from '@/hooks/automation/use-admin-workflows';
import { useAdminDatasetMutations } from '@/hooks/automation/use-admin-datasets';
import { Modal } from '@/components/ui/modal';
import { btnGhost, btnPrimary } from '@/app/[locale]/admin/_styles';

const SEARCH_DEBOUNCE_MS = 400;

interface ConnectWorkflowModalProps {
  organizationId: string;
  datasetId: string;
  isOpen: boolean;
  onClose: () => void;
  /** Los ya conectados salen del listado: ofrecerlos sería ofrecer una operación sin efecto. */
  connectedIds: string[];
}

/** Clon admin de `(dashboard)/datasets/_components/connect-workflow-modal.tsx`, acotado a una organización. */
export function ConnectWorkflowModal({
  organizationId,
  datasetId,
  isOpen,
  onClose,
  connectedIds,
}: ConnectWorkflowModalProps) {
  const t = useTranslations('Datasets');
  const { linkWorkflow } = useAdminDatasetMutations();
  const [workflowId, setWorkflowId] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handler);
  }, [query]);

  const { data, isLoading } = useAdminWorkflows(
    { organizationId, search: debouncedQuery || undefined, limit: DEFAULT_PAGE_SIZE },
    isOpen && !!organizationId,
  );

  const connected = new Set(connectedIds);
  const workflows = (data?.data ?? []).filter((workflow) => !connected.has(workflow.id));

  const close = () => {
    setWorkflowId('');
    setQuery('');
    onClose();
  };

  const handleConnect = async () => {
    try {
      await linkWorkflow.mutateAsync({ organizationId, id: datasetId, workflowId });
      close();
      toast.success(t('workflowConnected'));
    } catch {
      toast.error(t('connectError'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title={t('connectWorkflowTitle')}>
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">{t('connectWorkflowHint')}</p>

        <div className="space-y-2">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('searchWorkflowPlaceholder')}
              className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text-primary outline-none focus:border-border-focus"
            />
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
            {isLoading ? (
              <div className="flex h-24 items-center justify-center">
                <Loader2 size={18} className="animate-spin text-text-secondary" />
              </div>
            ) : workflows.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-text-secondary">
                {debouncedQuery
                  ? t('noResultsFor', { query: debouncedQuery })
                  : t('allWorkflowsAlreadyConnected')}
              </p>
            ) : (
              workflows.map((workflow) => {
                const selected = workflow.id === workflowId;
                return (
                  <button
                    key={workflow.id}
                    type="button"
                    onClick={() => setWorkflowId(workflow.id)}
                    className={`flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left transition-colors last:border-b-0 ${
                      selected ? 'bg-surface-secondary' : 'hover:bg-surface-secondary'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{workflow.name}</span>
                    {selected && <Check size={16} className="shrink-0 text-accent" />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button className={btnGhost} onClick={close}>
            {t('cancel')}
          </button>
          <button className={btnPrimary} onClick={handleConnect} disabled={!workflowId || linkWorkflow.isPending}>
            {linkWorkflow.isPending && <Loader2 size={16} className="animate-spin" />}
            {linkWorkflow.isPending ? t('connecting') : t('connect')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
