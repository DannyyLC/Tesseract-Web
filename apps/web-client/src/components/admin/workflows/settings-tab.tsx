'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';
import { useAdminWorkflowMutations } from '@/hooks/automation/use-admin-workflows';
import type { AdminWorkflowDetail } from '@/lib/api/endpoints/automation/workflows/workflows-admin-api';
import { btnPrimary, inputClass, labelClass } from '@/app/[locale]/admin/_styles';

interface Props {
  workflow: AdminWorkflowDetail;
}

type Form = {
  name: string;
  description: string;
  category: 'LIGHT' | 'STANDARD' | 'ADVANCED';
  maxTokensPerExecution: number;
  isActive: boolean;
  isPaused: boolean;
  timeout: number;
  maxRetries: number;
};

const toForm = (w: AdminWorkflowDetail): Form => ({
  name: w.name,
  description: w.description ?? '',
  category: w.category,
  maxTokensPerExecution: w.maxTokensPerExecution,
  isActive: w.isActive,
  isPaused: w.isPaused,
  timeout: w.timeout,
  maxRetries: w.maxRetries,
});

/**
 * Metadata del workflow. Va por `PATCH` y no toca el config, así que guardar aquí no
 * genera una versión nueva ni invalida una sesión de edición de prompts en curso.
 */
export function SettingsTab({ workflow }: Props) {
  const [form, setForm] = useState<Form>(() => toForm(workflow));
  const { updateMeta } = useAdminWorkflowMutations();

  // Si el workflow se recarga (p. ej. tras guardar el config), reflejar lo que llegó.
  useEffect(() => setForm(toForm(workflow)), [workflow]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(workflow));

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

  const Toggle = ({
    checked,
    onToggle,
    label,
    hint,
  }: {
    checked: boolean;
    onToggle: (v: boolean) => void;
    label: string;
    hint: string;
  }) => (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onToggle(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'border border-border bg-surface-secondary'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
      <div>
        <span className="block text-sm text-text-primary">{label}</span>
        <span className="block text-xs text-text-secondary">{hint}</span>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl space-y-4">
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
            value={form.maxTokensPerExecution}
            onChange={(e) => set('maxTokensPerExecution', Number(e.target.value))}
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
        <Toggle
          checked={form.isActive}
          onToggle={(v) => set('isActive', v)}
          label="Activo"
          hint="Si se desactiva, el workflow deja de ejecutarse por completo."
        />
        <Toggle
          checked={form.isPaused}
          onToggle={(v) => set('isPaused', v)}
          label="Pausado"
          hint="Sigue activo pero rechaza ejecuciones temporalmente."
        />
      </div>

      <div className="flex justify-end pt-2">
        <button className={btnPrimary} onClick={handleSave} disabled={!dirty || updateMeta.isPending}>
          {updateMeta.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar ajustes
        </button>
      </div>
    </div>
  );
}
