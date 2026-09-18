'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Copy, FilePlus2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { InfiniteSelect } from '@/components/ui/infinite-select';
import { Switch } from '@/components/ui/switch';
import {
  useAdminWorkflowMutations,
  useAdminWorkflows,
  useEditorContext,
} from '@/hooks/automation/use-admin-workflows';
import { useApiErrorMessage } from '@/hooks/shared/use-api-error-message';
import type { AdminOrganization } from '@/lib/api/endpoints/identity/organizations/organizations-admin-api';
import { btnGhost, btnPrimary, inputClass, labelClass } from '@/app/[locale]/admin/_styles';

type Mode = 'clone' | 'blank';

interface Props {
  organizations: AdminOrganization[];
  onClose: () => void;
  onCreated: (workflowId: string, message: string) => void;
}

/** Pipeline mínimo que sí arranca: un agente, START → agente → END. */
function blankConfig(model: string) {
  return {
    type: 'agent',
    graph: {
      type: 'pipeline',
      schema_version: 1,
      nodes: [{ id: 'agente', type: 'agent', agent: 'principal' }],
      edges: [
        { from: 'START', to: 'agente' },
        { from: 'agente', to: 'END' },
      ],
    },
    agents: {
      principal: {
        model,
        temperature: 0.7,
        system_prompt: 'Eres un asistente que atiende a los clientes de la empresa.',
      },
    },
  };
}

export function CreateWorkflowModal({ organizations, onClose, onCreated }: Props) {
  const t = useTranslations('Admin.CreateWorkflowModal');
  const getApiErrorMessage = useApiErrorMessage();
  const [mode, setMode] = useState<Mode>('clone');
  const [targetOrgId, setTargetOrgId] = useState('');
  const [sourceOrgId, setSourceOrgId] = useState('');
  const [sourceWorkflowId, setSourceWorkflowId] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'LIGHT' | 'STANDARD' | 'ADVANCED'>('STANDARD');
  const [maxTokens, setMaxTokens] = useState(50000);
  const [isInternal, setIsInternal] = useState(false);

  const { data: editorContext } = useEditorContext();
  const { createWorkflow, cloneWorkflow } = useAdminWorkflowMutations();

  const { data: sourceWorkflows, isLoading: sourceLoading } = useAdminWorkflows(
    { organizationId: sourceOrgId || undefined, limit: 100 },
    mode === 'clone' && !!sourceOrgId,
  );

  const orgOptions = useMemo(
    () => organizations.map((o) => ({ label: o.name, value: o.id })),
    [organizations],
  );

  const workflowOptions = useMemo(
    () => (sourceWorkflows?.data ?? []).map((w) => ({ label: w.name, value: w.id })),
    [sourceWorkflows],
  );

  const pending = createWorkflow.isPending || cloneWorkflow.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!targetOrgId) return toast.error(t('chooseTargetOrg'));
    if (name.trim().length < 3) return toast.error(t('nameTooShort'));

    if (mode === 'clone') {
      if (!sourceWorkflowId) return toast.error(t('chooseSourceWorkflow'));

      cloneWorkflow.mutate(
        { id: sourceWorkflowId, data: { targetOrganizationId: targetOrgId, name: name.trim() } },
        {
          onSuccess: (result) => {
            // Las tool instances son por organización: copiarlas en silencio dejaría
            // un workflow que parece bien y falla al ejecutarse.
            if (result.toolReferences.length > 0) {
              toast.warning(t('toolReferencesWarning', { count: result.toolReferences.length }), {
                duration: 8000,
              });
            }
            onCreated(result.workflow.id, t('workflowCloned'));
          },
          onError: (e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)),
        },
      );
      return;
    }

    const model = editorContext?.models[0]?.modelName;
    if (!model) return toast.error(t('noActiveModels'));

    createWorkflow.mutate(
      {
        organizationId: targetOrgId,
        name: name.trim(),
        category,
        maxHistoryTokens: maxTokens,
        config: blankConfig(model),
        note: 'Creado desde plantilla mínima',
        isInternal,
      },
      {
        onSuccess: (workflow) => onCreated(workflow.id, t('workflowCreated')),
        onError: (e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)),
      },
    );
  };

  return (
    <Modal isOpen onClose={onClose} title={t('modalTitle')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['clone', t('modeCloneLabel'), Copy, t('modeCloneHint')],
              ['blank', t('modeBlankLabel'), FilePlus2, t('modeBlankHint')],
            ] as const
          ).map(([value, label, Icon, hint]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                mode === value
                  ? 'border-accent bg-surface-secondary'
                  : 'border-border hover:bg-surface-secondary'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <Icon size={14} />
                {label}
              </span>
              <span className="mt-1 block text-xs text-text-secondary">{hint}</span>
            </button>
          ))}
        </div>

        {mode === 'clone' && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div>
              <label className={labelClass}>{t('sourceOrgLabel')}</label>
              <InfiniteSelect
                value={sourceOrgId}
                onChange={(v) => {
                  setSourceOrgId(v);
                  setSourceWorkflowId('');
                }}
                options={orgOptions}
                placeholder={t('sourceOrgPlaceholder')}
              />
            </div>
            <div>
              <label className={labelClass}>{t('sourceWorkflowLabel')}</label>
              <InfiniteSelect
                value={sourceWorkflowId}
                onChange={setSourceWorkflowId}
                options={workflowOptions}
                placeholder={sourceOrgId ? t('chooseWorkflow') : t('chooseOrgFirst')}
                isLoading={sourceLoading}
              />
            </div>
            <p className="flex gap-2 text-xs text-text-secondary">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {t('toolInstancesWarning')}
            </p>
          </div>
        )}

        <div>
          <label className={labelClass}>{t('targetOrgLabel')}</label>
          <InfiniteSelect
            value={targetOrgId}
            onChange={setTargetOrgId}
            options={orgOptions}
            placeholder={t('targetOrgPlaceholder')}
          />
        </div>

        <div>
          <label className={labelClass}>{t('nameLabel')}</label>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
          />
        </div>

        {mode === 'blank' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{t('categoryLabel')}</label>
              <select
                className={inputClass}
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
              >
                <option value="LIGHT">{t('categoryLight')}</option>
                <option value="STANDARD">{t('categoryStandard')}</option>
                <option value="ADVANCED">{t('categoryAdvanced')}</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>{t('maxTokensLabel')}</label>
              <input
                type="number"
                className={inputClass}
                value={maxTokens}
                min={1000}
                max={200000}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
              />
            </div>
            <div className="col-span-2 rounded-lg border border-border p-3">
              <Switch
                checked={isInternal}
                onChange={setIsInternal}
                label={t('internalLabel')}
                hint={t('internalHint')}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose} disabled={pending}>
            {t('cancel')}
          </button>
          <button type="submit" className={btnPrimary} disabled={pending}>
            {pending ? t('creating') : mode === 'clone' ? t('clone') : t('create')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
