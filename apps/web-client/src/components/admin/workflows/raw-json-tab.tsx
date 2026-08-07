'use client';

import { useState } from 'react';
import { AlertTriangle, Check, Download } from 'lucide-react';
import type { WorkflowConfig } from '@/lib/workflow-config/config-edit';
import { btnGhost, monoClass } from '@/app/[locale]/admin/_styles';

interface Props {
  config: WorkflowConfig;
  onChange: (next: WorkflowConfig) => void;
  workflowName: string;
}

/**
 * Escape hatch: el documento completo, editable.
 *
 * Es lo que garantiza que nada quede fuera del alcance del editor aunque no tenga
 * formulario propio. Se monta bajo demanda porque es la única vista que renderiza los
 * ~100 KB de golpe.
 */
export function RawJsonTab({ config, onChange, workflowName }: Props) {
  const serialized = JSON.stringify(config, null, 2);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commit = (text: string) => {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setError('El config debe ser un objeto JSON');
        return;
      }
      onChange(parsed);
      setDraft(null);
      setError(null);
    } catch (e) {
      // No se toca nada si el JSON no parsea: mejor conservar el borrador roto en
      // pantalla que descartar lo que el usuario escribió.
      setError((e as Error).message);
    }
  };

  const download = () => {
    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflowName.replace(/[^\w-]+/g, '_')}-config.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const text = draft ?? serialized;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-text-secondary">
          {serialized.length.toLocaleString('es')} caracteres ·{' '}
          {serialized.split('\n').length.toLocaleString('es')} líneas
        </div>
        <button className={btnGhost} onClick={download} type="button">
          <Download size={14} /> Descargar JSON
        </button>
      </div>

      <textarea
        rows={30}
        spellCheck={false}
        className={monoClass}
        value={text}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onBlur={(e) => commit(e.target.value)}
      />

      {error ? (
        <p className="flex items-center gap-1 text-xs text-danger">
          <AlertTriangle size={13} /> JSON inválido: {error}. No se aplicó ningún cambio.
        </p>
      ) : draft === null ? (
        <p className="flex items-center gap-1 text-xs text-text-secondary">
          <Check size={13} /> Sincronizado con las demás pestañas.
        </p>
      ) : (
        <p className="text-xs text-text-secondary">
          Los cambios se aplican al salir del campo.
        </p>
      )}
    </div>
  );
}
