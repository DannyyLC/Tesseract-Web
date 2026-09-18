'use client';

import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { DatasetWorkflowRef } from '@tesseract/types';
import { useAdminDatasetMutations } from '@/hooks/automation/use-admin-datasets';
import { Modal } from '@/components/ui/modal';
import { btnGhost } from '@/app/[locale]/admin/_styles';

interface DisconnectWorkflowModalProps {
  organizationId: string;
  datasetId: string;
  workflow: DatasetWorkflowRef | null;
  onClose: () => void;
}

/** Clon admin de `(dashboard)/datasets/_components/disconnect-workflow-modal.tsx`. */
export function DisconnectWorkflowModal({
  organizationId,
  datasetId,
  workflow,
  onClose,
}: DisconnectWorkflowModalProps) {
  const t = useTranslations('Datasets');
  const { unlinkWorkflow } = useAdminDatasetMutations();

  const handleDisconnect = async () => {
    if (!workflow) return;
    try {
      await unlinkWorkflow.mutateAsync({ organizationId, id: datasetId, workflowId: workflow.id });
      onClose();
      toast.success(t('disconnected', { name: workflow.name }));
    } catch {
      toast.error(t('disconnectError'));
    }
  };

  return (
    <Modal isOpen={Boolean(workflow)} onClose={onClose} title={t('disconnectWorkflowTitle')}>
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          {t('disconnectWorkflowBody', { name: workflow?.name ?? '' })}
        </p>

        <div className="flex justify-end gap-2">
          <button className={btnGhost} onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            onClick={handleDisconnect}
            disabled={unlinkWorkflow.isPending}
            className="flex items-center gap-2 rounded-lg bg-danger-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {unlinkWorkflow.isPending && <Loader2 size={16} className="animate-spin" />}
            {unlinkWorkflow.isPending ? t('disconnecting') : t('disconnectAction')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
