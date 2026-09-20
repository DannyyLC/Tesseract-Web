'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Unlink } from 'lucide-react';
import { DatasetWorkflowRef } from '@tesseract/types';
import { ConnectWorkflowModal } from './connect-workflow-modal';
import { DisconnectWorkflowModal } from './disconnect-workflow-modal';

interface ConnectedWorkflowsSectionProps {
  organizationId: string;
  datasetId: string;
  workflows: DatasetWorkflowRef[];
}

/** Clon admin de `(dashboard)/datasets/_components/connected-workflows-section.tsx`. */
export function ConnectedWorkflowsSection({ organizationId, datasetId, workflows }: ConnectedWorkflowsSectionProps) {
  const t = useTranslations('Datasets');
  const [isConnecting, setIsConnecting] = useState(false);
  const [workflowToDisconnect, setWorkflowToDisconnect] = useState<DatasetWorkflowRef | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary">{t('connectedWorkflows')}</h3>
        <button
          type="button"
          onClick={() => setIsConnecting(true)}
          className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
        >
          <Plus size={14} />
          {t('connectWorkflowButton')}
        </button>
      </div>

      {workflows.length > 0 ? (
        <AnimatePresence mode="popLayout">
          {workflows.map((workflow, index) => (
            <motion.div
              key={workflow.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: index * 0.05 }}
              className="group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2 transition-colors hover:border-border hover:bg-surface-secondary"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{workflow.name}</span>
              <button
                type="button"
                onClick={() => setWorkflowToDisconnect(workflow)}
                title={t('disconnectAction')}
                aria-label={t('disconnectAction')}
                className="hover:bg-danger/10 shrink-0 rounded-full p-1.5 text-text-tertiary opacity-100 transition-opacity hover:text-danger md:opacity-0 md:group-hover:opacity-100"
              >
                <Unlink size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      ) : (
        <p className="text-sm text-text-secondary">{t('noConnectedWorkflowsShort')}</p>
      )}

      <ConnectWorkflowModal
        organizationId={organizationId}
        datasetId={datasetId}
        isOpen={isConnecting}
        onClose={() => setIsConnecting(false)}
        connectedIds={workflows.map((workflow) => workflow.id)}
      />

      <DisconnectWorkflowModal
        organizationId={organizationId}
        datasetId={datasetId}
        workflow={workflowToDisconnect}
        onClose={() => setWorkflowToDisconnect(null)}
      />
    </section>
  );
}
