'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { DatasetWorkflowRef } from '@tesseract/types';
import { RequestWorkflowConnectionModal } from './request-workflow-connection-modal';

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
  const [isRequesting, setIsRequesting] = useState(false);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-text-primary">{t('connectedWorkflows')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">{t('connectedWorkflowsHint')}</p>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => setIsRequesting(true)}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-all hover:bg-[var(--surface-tint)] active:scale-95"
          >
            <Plus size={14} />
            {t('requestConnectionButton')}
          </button>
        )}
      </div>

      <div>
        {workflows.length > 0 ? (
          <AnimatePresence mode="popLayout">
            {workflows.map((workflow, index) => (
              <motion.div
                key={workflow.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center gap-3 rounded-xl border border-transparent p-3 transition-all duration-200 hover:border-border hover:bg-surface-panel hover:shadow-sm"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                  {workflow.name}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">{t('noConnectedWorkflows')}</p>
        )}
      </div>

      <RequestWorkflowConnectionModal
        datasetId={datasetId}
        isOpen={isRequesting}
        onClose={() => setIsRequesting(false)}
        connectedIds={workflows.map((workflow) => workflow.id)}
      />
    </section>
  );
}
