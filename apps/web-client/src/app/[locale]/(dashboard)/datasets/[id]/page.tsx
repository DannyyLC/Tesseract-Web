'use client';

import { use, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Eraser, FileUp, Loader2, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { DatasetField } from '@tesseract/types';
import PermissionGuard from '@/components/auth/permission-guard';
import { ImportCsvModal } from '@/components/datasets/import-csv-modal';
import { RecordsGrid } from '@/components/datasets/records-grid';
import { RecordsToolbar } from '@/components/datasets/records-toolbar';
import { PagePager } from '@/components/ui/page-pager';
import { usePageSize } from '@/hooks/shared/use-page-size';
import { useRecordSelection } from '@/components/datasets/use-record-selection';
import { ConfirmModal } from '@/components/ui/confirm-modal';
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
import { SchemaBuilder } from '../_components/schema-builder';


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

  const { pageSize, setPageSize } = usePageSize('datasets-records');
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 400);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const { data: records } = useDatasetRecords(id, pageSize, (page - 1) * pageSize, search);
  const { updateFields, clearRecords, createRecord, updateRecord, deleteRecords, importCsv } =
    useDatasetMutations();

  // La selección abarca solo la página visible, así que se vacía al paginar o al buscar.
  const selection = useRecordSelection(
    (records?.items ?? []).map((record) => record.id),
    `${page}|${pageSize}|${search}`,
  );

  const [isEditingSchema, setIsEditingSchema] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
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

  const handleDeleteSelected = async () => {
    try {
      // El conteo que se reporta es el del servidor, no el de la selección: si otra pestaña ya
      // borró una de esas filas, el número honesto es el que volvió.
      const { deleted } = await deleteRecords.mutateAsync({
        id,
        recordIds: selection.selectedVisibleIds,
      });
      selection.clear();
      setIsDeletingSelected(false);
      toast.success(t('deleteSelectedSuccess', { count: deleted }));
    } catch {
      toast.error(t('deleteSelectedError'));
    }
  };

  const totalPages = Math.max(1, Math.ceil((records?.total ?? 0) / pageSize));

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
                className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-danger-600 transition-colors hover:bg-[var(--danger-tint-hover)]"
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

            <PagePager
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              prevLabel={t('previous')}
              nextLabel={t('next')}
              emphasis="plain"
              className="shrink-0"
            />
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

          <RecordsToolbar
            search={searchInput}
            onSearchChange={setSearchInput}
            selectedCount={selection.selectedVisibleIds.length}
            onDeleteSelected={() => setIsDeletingSelected(true)}
            onClearSelection={selection.clear}
            canDelete={canEdit}
          />

          <RecordsGrid
            fields={dataset.fields}
            records={records?.items ?? []}
            readOnly={!canEdit}
            createDisabledReason={atRowLimit ? t('writesBlocked') : undefined}
            selection={canEdit ? selection : undefined}
            onCreate={async (data) => {
              await createRecord.mutateAsync({ id, data });
            }}
            onUpdate={async (recordId, data) => {
              await updateRecord.mutateAsync({ id, recordId, data });
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
            <div className="rounded-xl bg-[var(--badge-warning-bg-solid)] px-4 py-3 text-sm text-[var(--badge-warning-text-solid)]">
              {t('formulaOverwriteWarning', {
                columns: columnsLosingManualValues.join(', '),
                count: dataset.recordCount,
              })}
            </div>
          )}

          {schemaError && (
            <div className="rounded-xl border border-[var(--danger-banner-border)] bg-[var(--danger-banner-bg)] px-4 py-3 text-sm text-[var(--danger-text-adaptive)]">
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
        onImport={({ csv, fileName }) => importCsv.mutateAsync({ id, csv, fileName })}
      />

      <ConfirmModal
        isOpen={isDeletingSelected}
        onClose={() => setIsDeletingSelected(false)}
        onConfirm={handleDeleteSelected}
        title={t('deleteSelectedTitle')}
        message={t('deleteSelectedBody', {
          count: selection.selectedVisibleIds.length,
          name: dataset.name,
        })}
        confirmLabel={t('deleteSelected')}
        cancelLabel={t('cancel')}
        variant="danger"
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
