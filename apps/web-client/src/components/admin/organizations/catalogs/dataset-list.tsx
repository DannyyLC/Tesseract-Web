'use client';

import { useState } from 'react';
import { Database, Plus, Rows3, Workflow } from 'lucide-react';
import { DatasetField } from '@tesseract/types';
import { LogoLoader } from '@/components/ui/logo-loader';
import { Modal } from '@/components/ui/modal';
import { useAdminDatasetMutations, useAdminDatasets } from '@/hooks/automation/use-admin-datasets';
import { btnGhost, btnPrimary, inputClass, labelClass } from '@/app/[locale]/admin/_styles';
import { SchemaBuilder } from './schema-builder';

interface DatasetListProps {
  organizationId: string;
  onSelect: (datasetId: string) => void;
}

/** Listado de catálogos de una organización + alta. Clon admin de `(dashboard)/datasets/page.tsx`. */
export function DatasetList({ organizationId, onSelect }: DatasetListProps) {
  const { data, isLoading } = useAdminDatasets(organizationId);
  const { createDataset } = useAdminDatasetMutations();

  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<DatasetField[]>([{ key: '', label: '', type: 'text', order: 0 }]);
  const [error, setError] = useState<string | null>(null);

  const usage = data?.usage;
  const atDatasetLimit = !!usage && usage.maxDatasets !== -1 && usage.datasets >= usage.maxDatasets;

  const closeCreate = () => {
    setIsCreating(false);
    setName('');
    setDescription('');
    setFields([{ key: '', label: '', type: 'text', order: 0 }]);
    setError(null);
  };

  const handleCreate = async () => {
    setError(null);
    try {
      const created = await createDataset.mutateAsync({ organizationId, data: { name, description, fields } });
      if (created) {
        closeCreate();
        onSelect(created.id);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo crear el catálogo');
    }
  };

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-16">
        <LogoLoader text="Cargando catálogos" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Catálogos</h2>
          {usage && (
            <p className="mt-1 text-xs text-text-secondary">
              {usage.datasets} / {usage.maxDatasets === -1 ? '∞' : usage.maxDatasets} catálogos ·{' '}
              {usage.rows} / {usage.maxDatasetRows === -1 ? '∞' : usage.maxDatasetRows} filas
              {usage.writesBlocked && (
                <span className="ml-2 rounded-md bg-warning-500/10 px-1.5 py-0.5 text-warning-600">
                  Altas bloqueadas por límite de plan
                </span>
              )}
            </p>
          )}
        </div>
        <button
          className={btnPrimary}
          onClick={() => setIsCreating(true)}
          disabled={atDatasetLimit}
          title={atDatasetLimit ? 'Esta organización ya alcanzó su límite de catálogos' : undefined}
        >
          <Plus size={16} /> Nuevo catálogo
        </button>
      </div>

      {data.datasets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <Database size={28} className="mx-auto text-text-tertiary" />
          <p className="mt-3 text-sm text-text-secondary">Esta organización no tiene catálogos todavía.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.datasets.map((dataset) => (
            <button
              key={dataset.id}
              onClick={() => onSelect(dataset.id)}
              className="group rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-border-focus"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-surface-secondary p-2 text-accent">
                  <Database size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-text-primary">{dataset.name}</h3>
                  {dataset.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-text-secondary">{dataset.description}</p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-text-tertiary">
                <span className="flex items-center gap-1">
                  <Rows3 size={13} /> {dataset.recordCount} filas
                </span>
                <span>{dataset.fieldCount} columnas</span>
                <span className="flex items-center gap-1">
                  <Workflow size={13} /> {dataset.workflowIds.length} workflows
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal isOpen={isCreating} onClose={closeCreate} title="Nuevo catálogo" size="lg">
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Nombre</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Ej. Vehículos blindados" />
          </div>
          <div>
            <label className={labelClass}>Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={inputClass}
              placeholder="Para qué sirve — se lo dice al modelo"
            />
          </div>
          <div>
            <label className={labelClass}>Columnas</label>
            <SchemaBuilder fields={fields} onChange={setFields} />
          </div>

          {error && <div className="bg-danger/10 rounded-lg px-4 py-3 text-sm text-danger-600">{error}</div>}

          <div className="flex justify-end gap-2">
            <button className={btnGhost} onClick={closeCreate}>
              Cancelar
            </button>
            <button className={btnPrimary} onClick={handleCreate} disabled={!name.trim() || createDataset.isPending}>
              {createDataset.isPending ? 'Creando…' : 'Crear'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
