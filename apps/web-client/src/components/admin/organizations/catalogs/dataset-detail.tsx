'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, FileUp, Loader2, Settings2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DatasetField } from '@tesseract/types';
import { LogoLoader } from '@/components/ui/logo-loader';
import { Modal } from '@/components/ui/modal';
import {
  useAdminDataset,
  useAdminDatasetMutations,
  useAdminDatasetRecords,
} from '@/hooks/automation/use-admin-datasets';
import { btnGhost, btnPrimary, inputClass } from '@/app/[locale]/admin/_styles';
import { ConnectedWorkflowsSection } from './connected-workflows-section';
import { ImportCsvModal } from './import-csv-modal';
import { RecordsGrid } from './records-grid';
import { SchemaBuilder } from './schema-builder';

const PAGE_SIZE = 50;

interface DatasetDetailProps {
  organizationId: string;
  datasetId: string;
  onBack: () => void;
}

/**
 * Detalle de un catálogo, con la misma vista que el cliente ve en su dashboard: columnas, filas y
 * workflows conectados. Clon admin de `(dashboard)/datasets/[id]/page.tsx`.
 */
export function DatasetDetail({ organizationId, datasetId, onBack }: DatasetDetailProps) {
  const { data: dataset, isLoading } = useAdminDataset(organizationId, datasetId);
  const [page, setPage] = useState(0);
  const { data: records } = useAdminDatasetRecords(organizationId, datasetId, PAGE_SIZE, page * PAGE_SIZE);
  const { updateFields, deleteDataset, createRecord, updateRecord, deleteRecord, importCsv } =
    useAdminDatasetMutations();

  const [isEditingSchema, setIsEditingSchema] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [draftFields, setDraftFields] = useState<DatasetField[]>([]);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);

  useEffect(() => {
    if (dataset) setDraftFields(dataset.fields);
  }, [dataset]);

  if (isLoading || !dataset) {
    return (
      <div className="flex justify-center py-16">
        <LogoLoader text="Cargando catálogo" />
      </div>
    );
  }

  const columnsLosingManualValues = dataset.recordCount
    ? draftFields
        .filter((draft) => draft.formula)
        .filter((draft) => dataset.fields.some((saved) => saved.key === draft.key && !saved.formula))
        .map((draft) => draft.label || draft.key)
    : [];

  const closeSchemaEditor = () => {
    setIsEditingSchema(false);
    setOverwriteConfirmed(false);
    setSchemaError(null);
  };

  const saveSchema = async () => {
    setSchemaError(null);
    if (columnsLosingManualValues.length > 0 && !overwriteConfirmed) {
      setOverwriteConfirmed(true);
      return;
    }
    try {
      await updateFields.mutateAsync({ organizationId, id: datasetId, fields: draftFields });
      closeSchemaEditor();
    } catch (caught) {
      setSchemaError(caught instanceof Error ? caught.message : 'No se pudo guardar');
    }
  };

  const closeDelete = () => {
    setIsDeleting(false);
    setDeleteConfirmName('');
  };

  const canDelete = deleteConfirmName.trim() === dataset.name.trim();

  const handleDelete = async () => {
    if (!canDelete) return;
    try {
      await deleteDataset.mutateAsync({ organizationId, id: datasetId });
      onBack();
    } catch {
      toast.error('No se pudo eliminar el catálogo');
    }
  };

  const totalPages = Math.max(1, Math.ceil((records?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button
            onClick={onBack}
            className="mb-2 flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft size={14} /> Catálogos
          </button>
          <h2 className="text-base font-semibold text-text-primary">{dataset.name}</h2>
          {dataset.description && <p className="mt-1 max-w-2xl text-sm text-text-secondary">{dataset.description}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <button className={btnGhost} onClick={() => setIsEditingSchema(true)}>
            <Settings2 size={14} /> Columnas
          </button>
          <button className={btnGhost} onClick={() => setIsImporting(true)}>
            <FileUp size={14} /> Importar
          </button>
          <button
            onClick={() => setIsDeleting(true)}
            className="hover:bg-danger/10 flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-danger-600"
          >
            <Trash2 size={14} /> Eliminar
          </button>
        </div>
      </div>

      <ConnectedWorkflowsSection organizationId={organizationId} datasetId={datasetId} workflows={dataset.workflows} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Filas ({records?.total ?? 0})</h3>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg px-3 py-1 text-text-secondary hover:bg-surface-secondary disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-text-tertiary">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-lg px-3 py-1 text-text-secondary hover:bg-surface-secondary disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>

        <RecordsGrid
          fields={dataset.fields}
          records={records?.items ?? []}
          onCreate={async (data) => {
            await createRecord.mutateAsync({ organizationId, id: datasetId, data });
          }}
          onUpdate={async (recordId, data) => {
            await updateRecord.mutateAsync({ organizationId, id: datasetId, recordId, data });
          }}
          onDelete={async (recordId) => {
            await deleteRecord.mutateAsync({ organizationId, id: datasetId, recordId });
          }}
        />
      </section>

      <Modal isOpen={isEditingSchema} onClose={closeSchemaEditor} title="Editar columnas" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Lo que se quite no se borra de verdad: sus valores siguen en las filas y se restauran al volver a mandar
            la columna.
          </p>

          <SchemaBuilder fields={draftFields} onChange={setDraftFields} savedFields={dataset.fields} />

          {overwriteConfirmed && columnsLosingManualValues.length > 0 && (
            <div className="bg-warning/10 rounded-lg px-4 py-3 text-sm text-warning-600">
              Esto reemplaza lo capturado a mano en {columnsLosingManualValues.join(', ')} por el resultado de la
              fórmula, en las {dataset.recordCount} filas existentes.
            </div>
          )}

          {schemaError && <div className="bg-danger/10 rounded-lg px-4 py-3 text-sm text-danger-600">{schemaError}</div>}

          <div className="flex justify-end gap-2">
            <button className={btnGhost} onClick={closeSchemaEditor}>
              Cancelar
            </button>
            <button className={btnPrimary} onClick={saveSchema} disabled={updateFields.isPending}>
              {overwriteConfirmed && columnsLosingManualValues.length > 0 ? 'Confirmar y sobrescribir' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>

      <ImportCsvModal
        isOpen={isImporting}
        onClose={() => setIsImporting(false)}
        fields={dataset.fields}
        onImport={(csv) => importCsv.mutateAsync({ organizationId, id: datasetId, csv })}
      />

      <Modal isOpen={isDeleting} onClose={closeDelete} title="Eliminar catálogo">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Se eliminará "{dataset.name}" con sus {records?.total ?? 0} filas. Para confirmar, escribe su nombre.
          </p>
          <input
            value={deleteConfirmName}
            onChange={(e) => setDeleteConfirmName(e.target.value)}
            autoComplete="off"
            className={inputClass}
            placeholder={dataset.name}
          />
          <div className="flex justify-end gap-2">
            <button className={btnGhost} onClick={closeDelete}>
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={!canDelete || deleteDataset.isPending}
              className="flex items-center gap-2 rounded-lg bg-danger-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {deleteDataset.isPending && <Loader2 size={16} className="animate-spin" />}
              {deleteDataset.isPending ? 'Eliminando…' : 'Eliminar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
