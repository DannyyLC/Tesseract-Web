'use client';

import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { DatasetWorkflowRef } from '@tesseract/types';
import { useDatasetMutations } from '@/hooks/automation/use-datasets';
import { Modal } from '@/components/ui/modal';

interface DisconnectWorkflowModalProps {
  datasetId: string;
  /** El workflow a desconectar. `null` mantiene el modal cerrado, como en los demás de la página. */
  workflow: DatasetWorkflowRef | null;
  onClose: () => void;
}

export function DisconnectWorkflowModal({
  datasetId,
  workflow,
  onClose,
}: DisconnectWorkflowModalProps) {
  const t = useTranslations('Datasets');
  const { unlinkWorkflow } = useDatasetMutations();

  const handleDisconnect = async () => {
    if (!workflow) return;

    try {
      await unlinkWorkflow.mutateAsync({ id: datasetId, workflowId: workflow.id });
      onClose();
      toast.success(t('disconnectSuccess', { name: workflow.name }));
    } catch {
      toast.error(t('disconnectError'));
    }
  };

  return (
    <Modal isOpen={Boolean(workflow)} onClose={onClose} title={t('disconnectTitle')}>
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          {t('disconnectBody', { name: workflow?.name ?? '' })}
        </p>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-text-secondary hover:bg-[var(--surface-tint)]"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleDisconnect}
            disabled={unlinkWorkflow.isPending}
            className="flex items-center gap-2 rounded-xl bg-danger-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {unlinkWorkflow.isPending && <Loader2 size={16} className="animate-spin" />}
            {unlinkWorkflow.isPending ? t('disconnecting') : t('disconnect')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
