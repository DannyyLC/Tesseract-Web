'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiKeyResponseDto } from '@tesseract/types';
import { useApiKeyMutations } from '@/hooks/identity/use-api-key';
import { useInfiniteDashboardWorkflows } from '@/hooks/automation/use-workflows';
import { InfiniteSelect } from '@/components/ui/infinite-select';
import { Modal } from '@/components/ui/modal';

interface CreateApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Cuando el modal se abre desde el detalle de un workflow la key ya sabe a quién
   * pertenece: se oculta el selector y se ahorra el paso de buscarlo a mano.
   */
  lockedWorkflowId?: string;
  /** Recibe la key recién creada, con el token en claro que solo se ve una vez. */
  onCreated: (created: ApiKeyResponseDto) => void;
}

/** Selector de workflow. Aislado para no cargar el listado cuando el workflow ya viene dado. */
function WorkflowPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations('ApiKeys');
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteDashboardWorkflows(10);

  const options = (data?.pages.flatMap((page) => page.items) ?? []).map((wf) => ({
    label: wf.name,
    value: wf.id,
  }));

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

export function CreateApiKeyModal({
  isOpen,
  onClose,
  lockedWorkflowId,
  onCreated,
}: CreateApiKeyModalProps) {
  const t = useTranslations('ApiKeys');
  const { createApiKey } = useApiKeyMutations();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [workflowId, setWorkflowId] = useState('');

  const selectedWorkflowId = lockedWorkflowId ?? workflowId;
  const canSubmit = Boolean(name.trim() && selectedWorkflowId) && !createApiKey.isPending;

  const handleClose = () => {
    setName('');
    setDescription('');
    setWorkflowId('');
    onClose();
  };

  const handleCreate = async () => {
    if (!canSubmit) return;

    try {
      const created = await createApiKey.mutateAsync({
        name,
        description,
        workflowId: selectedWorkflowId,
      });
      handleClose();
      onCreated(created);
      toast.success(t('createSuccess'));
    } catch (error: any) {
      // El tope de API Keys del plan llega como 400 con un mensaje que le dice al usuario
      // qué hacer; tragárselo y mostrar el genérico deja la pantalla sin explicación.
      const serverMessage =
        typeof error?.response?.data?.message === 'string' && error.response.data.message.trim();
      toast.error(serverMessage || t('createError'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('newModalTitle')}>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-text-primary">
            {t('nameLabel')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
            className="w-full rounded-xl border border-border bg-surface-secondary px-4 py-2 text-text-primary transition-colors focus:border-border-hover focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-primary">
            {t('descriptionLabel')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('descriptionPlaceholder')}
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-surface-secondary px-4 py-2 text-text-primary transition-colors focus:border-border-hover focus:outline-none"
          />
        </div>

        {!lockedWorkflowId && <WorkflowPicker value={workflowId} onChange={setWorkflowId} />}

        <div className="flex gap-3 pt-4">
          <button
            onClick={handleClose}
            className="flex-1 rounded-xl bg-surface-secondary px-4 py-2 font-medium text-text-primary transition-colors hover:bg-surface-elevated"
          >
            {t('cancelButton')}
          </button>
          <button
            onClick={handleCreate}
            disabled={!canSubmit}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createApiKey.isPending ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              t('createButton')
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
