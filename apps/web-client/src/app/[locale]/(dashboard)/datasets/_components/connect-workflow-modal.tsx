'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDatasetMutations } from '@/hooks/automation/use-datasets';
import { useInfiniteDashboardWorkflows } from '@/hooks/automation/use-workflows';
import { InfiniteSelect } from '@/components/ui/infinite-select';
import { Modal } from '@/components/ui/modal';

interface ConnectWorkflowModalProps {
  datasetId: string;
  isOpen: boolean;
  onClose: () => void;
  /** Los ya conectados salen del selector: ofrecerlos sería ofrecer una operación sin efecto. */
  connectedIds: string[];
}

/**
 * Selector de workflow.
 *
 * Va aislado en su propio componente, y no en el cuerpo del modal, para que el listado solo se
 * pida cuando el modal está abierto: `Modal` no monta a sus hijos mientras está cerrado.
 */
function WorkflowPicker({
  value,
  onChange,
  connectedIds,
}: {
  value: string;
  onChange: (value: string) => void;
  connectedIds: string[];
}) {
  const t = useTranslations('Datasets');
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteDashboardWorkflows(10);

  const connected = new Set(connectedIds);
  const options = (data?.pages.flatMap((page) => page.items) ?? [])
    .filter((workflow) => !connected.has(workflow.id))
    .map((workflow) => ({ label: workflow.name, value: workflow.id }));

  // Con paginación no se puede afirmar que no queda nada hasta agotar las páginas.
  if (!isLoading && !hasNextPage && options.length === 0) {
    return <p className="text-sm text-text-secondary">{t('allWorkflowsConnected')}</p>;
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-text-primary">
        {t('workflowLabel')}
      </label>
      <InfiniteSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder={t('workflowPlaceholder')}
        isLoading={isLoading}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
      />
    </div>
  );
}

export function ConnectWorkflowModal({
  datasetId,
  isOpen,
  onClose,
  connectedIds,
}: ConnectWorkflowModalProps) {
  const t = useTranslations('Datasets');
  const { linkWorkflow } = useDatasetMutations();
  const [workflowId, setWorkflowId] = useState('');

  const close = () => {
    setWorkflowId('');
    onClose();
  };

  const handleConnect = async () => {
    try {
      await linkWorkflow.mutateAsync({ id: datasetId, workflowId });
      close();
      toast.success(t('connectSuccess'));
    } catch {
      toast.error(t('connectError'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title={t('connectWorkflowTitle')}>
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">{t('connectWorkflowHint')}</p>

        <WorkflowPicker value={workflowId} onChange={setWorkflowId} connectedIds={connectedIds} />

        <div className="flex justify-end gap-2">
          <button
            onClick={close}
            className="rounded-xl px-4 py-2 text-sm font-medium text-text-secondary hover:bg-[var(--surface-tint)]"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleConnect}
            disabled={!workflowId || linkWorkflow.isPending}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-text-inverse disabled:opacity-50"
          >
            {linkWorkflow.isPending && <Loader2 size={16} className="animate-spin" />}
            {linkWorkflow.isPending ? t('connecting') : t('connect')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
