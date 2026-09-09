'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RotateCcw, Save, Trash2 } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { Switch } from '@/components/ui/switch';
import { useAdminWorkflowMutations } from '@/hooks/automation/use-admin-workflows';
import type { AdminWorkflowDetail } from '@/lib/api/endpoints/automation/workflows/workflows-admin-api';
import { btnGhost, btnPrimary, inputClass, labelClass } from '@/app/[locale]/admin/_styles';
import { WorkflowChannelsSection } from './workflow-channels-section';

interface Props {
  workflow: AdminWorkflowDetail;
}

type Form = {
  name: string;
  description: string;
  category: 'LIGHT' | 'STANDARD' | 'ADVANCED';
  maxHistoryTokens: number;
  isActive: boolean;
  isPaused: boolean;
  isInternal: boolean;
  timeout: number;
  maxRetries: number;
};

const toForm = (w: AdminWorkflowDetail): Form => ({
  name: w.name,
  description: w.description ?? '',
  category: w.category,
  maxHistoryTokens: w.maxHistoryTokens,
  isActive: w.isActive,
  isPaused: w.isPaused,
  isInternal: w.isInternal,
  timeout: w.timeout,
  maxRetries: w.maxRetries,
});

/**
 * Metadata del workflow. Va por `PATCH` y no toca el config, así que guardar aquí no
 * genera una versión nueva ni invalida una sesión de edición de prompts en curso.
 */
export function SettingsTab({ workflow }: Props) {
  const [form, setForm] = useState<Form>(() => toForm(workflow));
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const { updateMeta, removeWorkflow, restoreWorkflow } = useAdminWorkflowMutations();

  // Si el workflow se recarga (p. ej. tras guardar el config), reflejar lo que llegó.
  useEffect(() => setForm(toForm(workflow)), [workflow]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setIsInternal = (value: boolean) => {
    // Apagarlo es "publicar": el workflow se vuelve visible y ejecutable para el cliente,
    // que hasta ahora no sabía que existía. Prendiéndolo (ocultarlo de nuevo) no hace
    // falta confirmar: no hay nada que se le revele a nadie.
    if (!value) {
      setConfirmPublishOpen(true);
      return;
    }
    set('isInternal', value);
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(workflow));

  const handleDelete = async () => {
    try {
      await removeWorkflow.mutateAsync(workflow.id);
      toast.success('Workflow eliminado');
      setConfirmDeleteOpen(false);
    } catch (e: any) {
      if (!e?.toastHandled) toast.error(e?.message ?? 'No se pudo eliminar');
    }
  };

  const handleRestore = () => {
    restoreWorkflow.mutate(workflow.id, {
      onSuccess: () => toast.success('Workflow restaurado'),
      onError: (e: any) => !e?.toastHandled && toast.error(e?.message ?? 'No se pudo restaurar'),
    });
  };

  const handleSave = () => {
    if (form.name.trim().length < 3) return toast.error('El nombre debe tener al menos 3 caracteres');

    updateMeta.mutate(
      {
        id: workflow.id,
        data: { ...form, description: form.description.trim() || undefined },
      },
      {
        onSuccess: () => toast.success('Ajustes guardados'),
        onError: (e: any) => !e?.toastHandled && toast.error(e?.message ?? 'No se pudo guardar'),
      },
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-secondary">
        Estos ajustes no forman parte del config, así que guardarlos no crea una versión nueva ni
        interfiere con los cambios que tengas pendientes en las otras pestañas.
      </p>

      <div>
        <label className={labelClass}>Nombre</label>
        <input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} />
      </div>

      <div>
        <label className={labelClass}>Descripción</label>
        <textarea
          rows={2}
          className={inputClass}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Categoría (define el costo en créditos)</label>
          <select
            className={inputClass}
            value={form.category}
            onChange={(e) => set('category', e.target.value as Form['category'])}
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
            min={1000}
            max={200000}
            className={inputClass}
            value={form.maxHistoryTokens}
            onChange={(e) => set('maxHistoryTokens', Number(e.target.value))}
          />
        </div>
        <div>
          <label className={labelClass}>Timeout (segundos, 30–3600)</label>
          <input
            type="number"
            min={30}
            max={3600}
            className={inputClass}
            value={form.timeout}
            onChange={(e) => set('timeout', Number(e.target.value))}
          />
        </div>
        <div>
          <label className={labelClass}>Reintentos máximos (0–10)</label>
          <input
            type="number"
            min={0}
            max={10}
            className={inputClass}
            value={form.maxRetries}
            onChange={(e) => set('maxRetries', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-3">
          <Switch
            checked={form.isActive}
            onChange={(v) => set('isActive', v)}
            label="Activo"
            hint="Si se desactiva, el workflow deja de ejecutarse por completo."
          />
        </div>
        <div className="rounded-lg border border-border p-3">
          <Switch
            checked={form.isPaused}
            onChange={(v) => set('isPaused', v)}
            label="Pausado"
            hint="Sigue activo pero rechaza ejecuciones temporalmente."
          />
        </div>
        <div className="rounded-lg border border-border p-3 sm:col-span-2">
          <Switch
            checked={form.isInternal}
            onChange={setIsInternal}
            label="Interno (oculto para el cliente)"
            hint="No aparece en su panel, no gasta sus créditos ni cuenta en sus estadísticas. Apagarlo lo publica."
          />
        </div>
      </div>

      <WorkflowChannelsSection workflowId={workflow.id} organizationId={workflow.organization.id} />

      <div className="rounded-lg border border-danger p-3">
        <p className="text-xs font-medium text-danger">Zona de peligro</p>
        {workflow.deletedAt ? (
          <>
            <p className="mt-1 text-xs text-text-secondary">
              Este workflow está eliminado desde el {new Date(workflow.deletedAt).toLocaleString()}.
              Restaurarlo no lo reactiva solo — sigue con "Activo" apagado hasta que lo prendas
              aquí arriba.
            </p>
            <button
              className={`${btnGhost} mt-2`}
              onClick={handleRestore}
              disabled={restoreWorkflow.isPending}
            >
              {restoreWorkflow.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RotateCcw size={14} />
              )}
              Restaurar workflow
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-text-secondary">
              Deja de ejecutarse de inmediato (cron, API, WhatsApp). Se puede restaurar después.
            </p>
            <button
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={removeWorkflow.isPending}
            >
              {removeWorkflow.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
              Eliminar workflow
            </button>
          </>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <button className={btnPrimary} onClick={handleSave} disabled={!dirty || updateMeta.isPending}>
          {updateMeta.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar ajustes
        </button>
      </div>

      <ConfirmModal
        isOpen={confirmPublishOpen}
        onClose={() => setConfirmPublishOpen(false)}
        onConfirm={() => {
          set('isInternal', false);
          setConfirmPublishOpen(false);
        }}
        variant="warning"
        title="Publicar workflow"
        message="Vas a publicar este workflow: el cliente lo va a ver en su panel y va a poder ejecutarlo. ¿Ya está listo?"
        confirmLabel="Publicar"
      />

      <ConfirmModal
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        variant="danger"
        title="Eliminar workflow"
        message="Vas a eliminar este workflow. Deja de ejecutarse de inmediato (cron, API, WhatsApp) y se puede restaurar después desde aquí mismo."
        confirmLabel="Eliminar"
      />
    </div>
  );
}
