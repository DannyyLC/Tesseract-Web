'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, Phone, Workflow as WorkflowIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { WhatsappOutboundUnlinkedWorkflowDto } from '@tesseract/types';
import { useTenantToolMutations } from '@/hooks/automation/use-tenant-tools';

interface WhatsappOutboundLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  unlinkedWorkflows: WhatsappOutboundUnlinkedWorkflowDto[];
}

export function WhatsappOutboundLinkModal({
  isOpen,
  onClose,
  unlinkedWorkflows,
}: WhatsappOutboundLinkModalProps) {
  const t = useTranslations('Integrations');
  const [selected, setSelected] = useState<string[]>([]);
  const { linkWhatsappOutboundWorkflows } = useTenantToolMutations();

  useEffect(() => {
    if (isOpen) {
      setSelected(unlinkedWorkflows.map((w) => w.workflowId));
    }
  }, [isOpen, unlinkedWorkflows]);

  const toggle = (workflowId: string) => {
    setSelected((prev) =>
      prev.includes(workflowId) ? prev.filter((id) => id !== workflowId) : [...prev, workflowId],
    );
  };

  const toggleAll = () => {
    if (selected.length === unlinkedWorkflows.length) {
      setSelected([]);
    } else {
      setSelected(unlinkedWorkflows.map((w) => w.workflowId));
    }
  };

  const handleConfirm = async () => {
    if (selected.length === 0) {
      toast.error(t('whatsappLinkSelectRequired'));
      return;
    }

    try {
      await linkWhatsappOutboundWorkflows.mutateAsync(selected);
      toast.success(t('whatsappLinkSuccess'));
      onClose();
    } catch (error: any) {
      const backendMessage =
        (typeof error?.message === 'string' && error.message.trim()) ||
        (typeof error?.response?.data?.message === 'string' &&
          error.response.data.message.trim()) ||
        '';
      toast.error(backendMessage || t('whatsappLinkError'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('whatsappLinkModalTitle')}>
      <div className="space-y-4 py-2">
        <p className="text-xs text-text-secondary">{t('whatsappLinkModalDesc')}</p>

        {unlinkedWorkflows.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-tertiary">
            {t('whatsappLinkEmptyState')}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-text-secondary">
                {t('whatsappLinkListLabel')}
              </label>
              <button
                onClick={toggleAll}
                className="text-[10px] font-bold uppercase tracking-wider text-text-secondary hover:text-text-primary"
              >
                {selected.length === unlinkedWorkflows.length ? t('deselectAll') : t('selectAll')}
              </button>
            </div>

            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {unlinkedWorkflows.map((wf) => (
                <button
                  key={wf.workflowId}
                  onClick={() => toggle(wf.workflowId)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                    selected.includes(wf.workflowId)
                      ? 'border-border-hover bg-[var(--surface-tint)]'
                      : 'border-[var(--border-subtle)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-tint)]'
                  }`}
                >
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                      selected.includes(wf.workflowId)
                        ? 'border-accent bg-accent text-text-inverse'
                        : 'border-border-hover bg-surface-elevated'
                    }`}
                  >
                    {selected.includes(wf.workflowId) && <Check size={12} strokeWidth={3} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-xs font-semibold text-text-primary">
                      <WorkflowIcon size={10} className="shrink-0" />
                      {wf.workflowName}
                    </p>
                    <div className="mt-1 flex flex-col gap-0.5">
                      {wf.whatsappNumbers.map((num) => (
                        <p
                          key={num.whatsappConfigId}
                          className="flex items-center gap-1 truncate text-[10px] text-text-tertiary"
                        >
                          <Phone size={10} className="shrink-0" />
                          {num.displayName ? `${num.displayName} · ${num.phoneNumber}` : num.phoneNumber}
                        </p>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={handleConfirm}
              disabled={linkWhatsappOutboundWorkflows.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-semibold text-text-inverse transition-all hover:opacity-90 disabled:opacity-50"
            >
              {linkWhatsappOutboundWorkflows.isPending ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                t('whatsappLinkConfirm', { count: selected.length })
              )}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
