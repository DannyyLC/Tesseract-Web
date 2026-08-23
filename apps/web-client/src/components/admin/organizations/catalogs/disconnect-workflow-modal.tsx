'use client';

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
  const { unlinkWorkflow } = useAdminDatasetMutations();

  const handleDisconnect = async () => {
    if (!workflow) return;
    try {
      await unlinkWorkflow.mutateAsync({ organizationId, id: datasetId, workflowId: workflow.id });
      onClose();
      toast.success(`"${workflow.name}" desconectado`);
    } catch {
      toast.error('No se pudo desconectar el workflow');
    }
  };

  return (
    <Modal isOpen={Boolean(workflow)} onClose={onClose} title="Desconectar workflow">
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          "{workflow?.name}" dejará de poder consultar este catálogo.
        </p>

        <div className="flex justify-end gap-2">
          <button className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button
            onClick={handleDisconnect}
            disabled={unlinkWorkflow.isPending}
            className="flex items-center gap-2 rounded-lg bg-danger-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {unlinkWorkflow.isPending && <Loader2 size={16} className="animate-spin" />}
            {unlinkWorkflow.isPending ? 'Desconectando…' : 'Desconectar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
