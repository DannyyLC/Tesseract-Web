'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Plus, Unlink, Workflow as WorkflowIcon } from 'lucide-react';
import { toast } from 'sonner';
import { DatasetWorkflowRef } from '@tesseract/types';
import { useDatasetMutations } from '@/hooks/automation/use-datasets';
import { ConnectWorkflowModal } from './connect-workflow-modal';

/**
 * Workflows que consultan el catálogo.
 *
 * La sección lista **solo lo conectado**, igual que las API Keys en el detalle de un workflow. La
 * versión anterior pintaba el catálogo completo de workflows como chips y el estado conectado era
 * un cambio de color: se leía como un filtro, no como una relación, y el encabezado prometía una
 * lista de conectados que en realidad eran candidatos.
 */

interface ConnectedWorkflowsSectionProps {
  datasetId: string;
  workflows: DatasetWorkflowRef[];
  canEdit: boolean;
}

export function ConnectedWorkflowsSection({
  datasetId,
  workflows,
  canEdit,
}: ConnectedWorkflowsSectionProps) {
  const t = useTranslations('Datasets');
  const { unlinkWorkflow } = useDatasetMutations();
  const [isConnecting, setIsConnecting] = useState(false);

  // Desconectar no pide confirmación: es reversible con un click y no borra nada. El toast es el
  // que cierra el ciclo — sin él, un fallo de red se veía como "no pasó nada".
  const disconnect = async (workflow: DatasetWorkflowRef) => {
    try {
      await unlinkWorkflow.mutateAsync({ id: datasetId, workflowId: workflow.id });
      toast.success(t('disconnectSuccess', { name: workflow.name }));
    } catch {
      toast.error(t('disconnectError'));
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-surface-elevated p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-text-primary">{t('connectedWorkflows')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">{t('connectedWorkflowsHint')}</p>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => setIsConnecting(true)}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-all hover:bg-[var(--surface-tint)] active:scale-95"
          >
            <Plus size={14} />
            {t('connectWorkflow')}
          </button>
        )}
      </div>

      <div className="mt-4">
        {workflows.length > 0 ? (
          <AnimatePresence mode="popLayout">
            {workflows.map((workflow, index) => {
              const pending =
                unlinkWorkflow.isPending && unlinkWorkflow.variables?.workflowId === workflow.id;

              return (
                <motion.div
                  key={workflow.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.05 }}
                  className="group flex items-center gap-3 rounded-xl border border-transparent p-3 transition-all duration-200 hover:border-border hover:bg-surface-panel hover:shadow-sm"
                >
                  <div className="shrink-0 rounded-lg bg-surface-secondary p-2 text-text-secondary">
                    <WorkflowIcon size={16} />
                  </div>

                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                    {workflow.name}
                  </span>

                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => disconnect(workflow)}
                      disabled={pending}
                      title={t('disconnect')}
                      aria-label={t('disconnect')}
                      /* Aparece al pasar el cursor, como en las API Keys, pero se queda visible en
                         pantallas chicas: sin hover no habría forma de desconectar. */
                      className="hover:bg-danger/10 shrink-0 rounded-full p-2 text-text-tertiary opacity-100 transition-opacity hover:text-danger focus-visible:opacity-100 disabled:opacity-50 md:opacity-0 md:group-hover:opacity-100"
                    >
                      {pending ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Unlink size={16} />
                      )}
                    </button>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">{t('noConnectedWorkflows')}</p>
        )}
      </div>

      <ConnectWorkflowModal
        datasetId={datasetId}
        isOpen={isConnecting}
        onClose={() => setIsConnecting(false)}
        connectedIds={workflows.map((workflow) => workflow.id)}
      />
    </section>
  );
}
