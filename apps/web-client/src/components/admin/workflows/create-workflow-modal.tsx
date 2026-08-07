'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Copy, FilePlus2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { InfiniteSelect } from '@/components/ui/infinite-select';
import {
  useAdminWorkflowMutations,
  useAdminWorkflows,
  useEditorContext,
} from '@/hooks/automation/use-admin-workflows';
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
  const [mode, setMode] = useState<Mode>('clone');
  const [targetOrgId, setTargetOrgId] = useState('');
  const [sourceOrgId, setSourceOrgId] = useState('');
  const [sourceWorkflowId, setSourceWorkflowId] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'LIGHT' | 'STANDARD' | 'ADVANCED'>('STANDARD');
  const [maxTokens, setMaxTokens] = useState(50000);

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

    if (!targetOrgId) return toast.error('Elige la organización destino');
    if (name.trim().length < 3) return toast.error('El nombre debe tener al menos 3 caracteres');

    if (mode === 'clone') {
      if (!sourceWorkflowId) return toast.error('Elige el workflow a clonar');

      cloneWorkflow.mutate(
        { id: sourceWorkflowId, data: { targetOrganizationId: targetOrgId, name: name.trim() } },
        {
          onSuccess: (result) => {
            // Las tool instances son por organización: copiarlas en silencio dejaría
            // un workflow que parece bien y falla al ejecutarse.
            if (result.toolReferences.length > 0) {
              toast.warning(
                `Hay ${result.toolReferences.length} referencia(s) a tools de la organización origen que debes reasignar.`,
                { duration: 8000 },
              );
            }
            onCreated(result.workflow.id, 'Workflow clonado');
          },
          onError: (e: any) => !e?.toastHandled && toast.error(e?.message ?? 'No se pudo clonar'),
        },
      );
      return;
    }

    const model = editorContext?.models[0]?.modelName;
    if (!model) return toast.error('No hay modelos LLM activos para la plantilla');

    createWorkflow.mutate(
      {
        organizationId: targetOrgId,
        name: name.trim(),
        category,
        maxTokensPerExecution: maxTokens,
        config: blankConfig(model),
        note: 'Creado desde plantilla mínima',
      },
      {
        onSuccess: (workflow) => onCreated(workflow.id, 'Workflow creado'),
        onError: (e: any) => !e?.toastHandled && toast.error(e?.message ?? 'No se pudo crear'),
      },
    );
  };

  return (
    <Modal isOpen onClose={onClose} title="Nuevo workflow">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['clone', 'Clonar existente', Copy, 'Parte de un workflow que ya funciona'],
              ['blank', 'Plantilla mínima', FilePlus2, 'Un agente, START → agente → END'],
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
              <label className={labelClass}>Organización origen</label>
              <InfiniteSelect
                value={sourceOrgId}
                onChange={(v) => {
                  setSourceOrgId(v);
                  setSourceWorkflowId('');
                }}
                options={orgOptions}
                placeholder="Elige de dónde copiar"
              />
            </div>
            <div>
              <label className={labelClass}>Workflow a clonar</label>
              <InfiniteSelect
                value={sourceWorkflowId}
                onChange={setSourceWorkflowId}
                options={workflowOptions}
                placeholder={sourceOrgId ? 'Elige el workflow' : 'Primero elige la organización'}
                isLoading={sourceLoading}
              />
            </div>
            <p className="flex gap-2 text-xs text-text-secondary">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              Las tool instances son de cada organización. Si el workflow usa alguna, habrá que
              reasignarla después de clonar.
            </p>
          </div>
        )}

        <div>
          <label className={labelClass}>Organización destino</label>
          <InfiniteSelect
            value={targetOrgId}
            onChange={setTargetOrgId}
            options={orgOptions}
            placeholder="Elige el cliente"
          />
        </div>

        <div>
          <label className={labelClass}>Nombre</label>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Asistente de ventas WhatsApp"
          />
        </div>

        {mode === 'blank' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Categoría</label>
              <select
                className={inputClass}
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
              >
                <option value="LIGHT">LIGHT (1 crédito)</option>
                <option value="STANDARD">STANDARD (5 créditos)</option>
                <option value="ADVANCED">ADVANCED (25 créditos)</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Tokens máx. por ejecución</label>
              <input
                type="number"
                className={inputClass}
                value={maxTokens}
                min={1000}
                max={200000}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary} disabled={pending}>
            {pending ? 'Creando…' : mode === 'clone' ? 'Clonar' : 'Crear'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
