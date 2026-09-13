'use client';

import { use, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eraser, FileUp, Loader2, Search, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { DatasetField } from '@tesseract/types';
import PermissionGuard from '@/components/auth/permission-guard';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/hooks/identity/use-auth';
import { useDebounce } from '@/hooks/use-debounce';
import {
  useDataset,
  useDatasetMutations,
  useDatasetRecords,
  useDatasets,
} from '@/hooks/automation/use-datasets';
import { ConnectedWorkflowsSection } from '../_components/connected-workflows-section';
import { ImportCsvModal } from '../_components/import-csv-modal';
import { RecordsGrid } from '../_components/records-grid';
import { SchemaBuilder } from '../_components/schema-builder';

const PAGE_SIZE = 50;

export default function DatasetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('Datasets');

  const { data: user } = useAuth();
  const canEdit = user?.role === 'OWNER' || user?.role === 'ADMIN';

  const { data: dataset, isLoading } = useDataset(id);
  // El límite de filas es por organización, no por catálogo: se pide de la misma lista que ya
  // lo trae para la pantalla de "Catálogos" en vez de exponer un endpoint nuevo solo para esto.
  const { data: list } = useDatasets();
  const usage = list?.usage;
  const atRowLimit = !!usage && usage.writesBlocked;

  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 400);

  useEffect(() => {
    setPage(0);
  }, [search]);

  const { data: records } = useDatasetRecords(id, PAGE_SIZE, page * PAGE_SIZE, search);
  const {
    updateFields,
    clearRecords,
    createRecord,
    updateRecord,
    deleteRecord,
    importCsv,
  } = useDatasetMutations();

  const [isEditingSchema, setIsEditingSchema] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearConfirmName, setClearConfirmName] = useState('');
  const [draftFields, setDraftFields] = useState<DatasetField[]>([]);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);

  useEffect(() => {
    if (dataset) setDraftFields(dataset.fields);
  }, [dataset]);

  if (isLoading || !dataset) {
    return <p className="text-sm text-text-tertiary">{t('loading')}</p>;
  }

  /**
   * Columnas que hoy se capturan a mano y a las que esta edición les pone fórmula.
   *
   * Guardar reemplaza lo capturado por el resultado del cálculo en todas las filas, y eso no se
   * deshace. Editar una fórmula que ya existía no entra aquí: ahí lo que se sobrescribe son valores
   * que la fórmula anterior había generado, que es justo lo que el cliente está pidiendo.
   */
  const columnsLosingManualValues = dataset.recordCount
    ? draftFields
        .filter((draft) => draft.formula)
        .filter((draft) =>
          dataset.fields.some((saved) => saved.key === draft.key && !saved.formula),
        )
        .map((draft) => draft.label || draft.key)
    : [];

  const closeSchemaEditor = () => {
    setIsEditingSchema(false);
    setOverwriteConfirmed(false);
    setSchemaError(null);
  };

  const saveSchema = async () => {
    setSchemaError(null);

    // El primer clic solo avisa; el segundo guarda. Es la única barrera contra perder captura
    // manual, y no hace falta más: el resto de las ediciones de fórmula reemplazan valores que
    // generó una fórmula anterior, no trabajo de alguien.
    if (columnsLosingManualValues.length > 0 && !overwriteConfirmed) {
      setOverwriteConfirmed(true);
      return;
    }

    try {
      await updateFields.mutateAsync({ id, fields: draftFields });
      closeSchemaEditor();
    } catch (caught) {
      setSchemaError(caught instanceof Error ? caught.message : t('saveError'));
    }
  };

  const closeClear = () => {
    setIsClearing(false);
    setClearConfirmName('');
  };

  // Se comparan sin espacios en el borde —copiar y pegar el nombre suele arrastrarlos— pero
  // respetando mayusculas y acentos: es una confirmacion, no una busqueda.
  const canClear = clearConfirmName.trim() === dataset.name.trim();

  const handleClear = async () => {
    if (!canClear) return;

    try {
      await clearRecords.mutateAsync(id);
      closeClear();
    } catch {
      toast.error(t('clearDataError'));
    }
  };

  const totalPages = Math.max(1, Math.ceil((records?.total ?? 0) / PAGE_SIZE));

  return (
    <PermissionGuard permissions="datasets:read" redirect fallbackRoute="/dashboard">
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{dataset.name}</h1>
            {dataset.description && (
              <p className="mt-1 max-w-2xl text-sm text-text-secondary">{dataset.description}</p>
            )}
          </div>

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setIsEditingSchema(true)}
                className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-[var(--surface-tint)]"
              >
                <Settings2 size={16} />
                {t('editColumns')}
              </button>
              <button
                onClick={() => setIsImporting(true)}
                disabled={atRowLimit}
                title={atRowLimit ? t('writesBlocked') : undefined}
                className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-[var(--surface-tint)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileUp size={16} />
                {t('import')}
              </button>
              <button
                onClick={() => setIsClearing(true)}
                className="hover:bg-danger/10 flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-danger-600"
              >
                <Eraser size={16} />
                {t('clearData')}
              </button>
            </div>
          )}
        </div>

        <ConnectedWorkflowsSection
          datasetId={id}
          workflows={dataset.workflows}
          canEdit={canEdit}
        />

        {/* ─── Filas ───────────────────────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-text-primary">
              {t('rowsHeading', { count: records?.total ?? 0 })}
            </h2>

            {totalPages > 1 && (
              <div className="flex items-center gap-2 text-sm">
                <button
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  disabled={page === 0}
                  className="rounded-lg px-3 py-1 text-text-secondary hover:bg-[var(--surface-tint)] disabled:opacity-40"
                >
                  {t('previous')}
                </button>
                <span className="text-text-tertiary">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                  disabled={page >= totalPages - 1}
                  className="rounded-lg px-3 py-1 text-text-secondary hover:bg-[var(--surface-tint)] disabled:opacity-40"
                >
                  {t('next')}
                </button>
              </div>
            )}
          </div>

          {/* El consumo va a la vista: un botón deshabilitado sin explicación es peor que el
              límite (mismo criterio que la pantalla de lista de catálogos). */}
          {usage && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface-elevated px-5 py-3 text-sm">
              <span className="text-text-tertiary">{t('usageRows')}: </span>
              <span className="font-medium text-text-primary">
                {usage.rows} / {usage.maxDatasetRows === -1 ? '∞' : usage.maxDatasetRows}
              </span>
              {atRowLimit && (
                <span className="rounded-lg bg-warning-500/10 px-2 py-1 text-xs font-medium text-warning-600">
                  {t('writesBlocked')}
                </span>
              )}
            </div>
          )}

          <div className="relative max-w-sm">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full rounded-xl border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text-primary outline-none focus:border-accent"
            />
          </div>

          <RecordsGrid
            fields={dataset.fields}
            records={records?.items ?? []}
            readOnly={!canEdit}
            createDisabledReason={atRowLimit ? t('writesBlocked') : undefined}
            onCreate={async (data) => {
              await createRecord.mutateAsync({ id, data });
            }}
            onUpdate={async (recordId, data) => {
              await updateRecord.mutateAsync({ id, recordId, data });
            }}
            onDelete={async (recordId) => {
              await deleteRecord.mutateAsync({ id, recordId });
            }}
          />
        </section>
      </div>

      {/* ─── Editor de columnas ─────────────────────────────────────────────── */}
      <Modal
        isOpen={isEditingSchema}
        onClose={closeSchemaEditor}
        title={t('editColumns')}
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">{t('editColumnsHint')}</p>

          <SchemaBuilder fields={draftFields} onChange={setDraftFields} savedFields={dataset.fields} />

          {overwriteConfirmed && columnsLosingManualValues.length > 0 && (
            <div className="bg-warning/10 rounded-xl px-4 py-3 text-sm text-warning-600">
              {t('formulaOverwriteWarning', {
                columns: columnsLosingManualValues.join(', '),
                count: dataset.recordCount,
              })}
            </div>
          )}

          {schemaError && (
            <div className="bg-danger/10 rounded-xl px-4 py-3 text-sm text-danger-600">
              {schemaError}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={closeSchemaEditor}
              className="rounded-xl px-4 py-2 text-sm font-medium text-text-secondary hover:bg-[var(--surface-tint)]"
            >
              {t('cancel')}
            </button>
            <button
              onClick={saveSchema}
              disabled={updateFields.isPending}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-text-inverse disabled:opacity-50"
            >
              {overwriteConfirmed && columnsLosingManualValues.length > 0
                ? t('formulaOverwriteConfirm')
                : t('save')}
            </button>
          </div>
        </div>
      </Modal>

      <ImportCsvModal
        isOpen={isImporting}
        onClose={() => setIsImporting(false)}
        fields={dataset.fields}
        onImport={(csv) => importCsv.mutateAsync({ id, csv })}
      />

      <Modal isOpen={isClearing} onClose={closeClear} title={t('clearDataTitle')}>
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            {t('clearDataBody', { name: dataset.name, count: records?.total ?? 0 })}
          </p>

          {/* Escribir el nombre es la unica barrera real: las filas se borran sin poder
              deshacerse, y quien llega aqui por inercia no lo teclea. */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              {t('clearDataConfirmLabel', { name: dataset.name })}
            </label>
            <input
              value={clearConfirmName}
              onChange={(event) => setClearConfirmName(event.target.value)}
              autoComplete="off"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={closeClear}
              className="rounded-xl px-4 py-2 text-sm font-medium text-text-secondary hover:bg-[var(--surface-tint)]"
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleClear}
              disabled={!canClear || clearRecords.isPending}
              className="flex items-center gap-2 rounded-xl bg-danger-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {clearRecords.isPending && <Loader2 size={16} className="animate-spin" />}
              {clearRecords.isPending ? t('clearingData') : t('clearData')}
            </button>
          </div>
        </div>
      </Modal>
    </PermissionGuard>
  );
}
