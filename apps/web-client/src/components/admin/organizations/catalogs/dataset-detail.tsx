'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Eraser, FileUp, Loader2, Settings2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DatasetField } from '@tesseract/types';
import { ImportCsvModal } from '@/components/datasets/import-csv-modal';
import { RecordsGrid } from '@/components/datasets/records-grid';
import { RecordsToolbar } from '@/components/datasets/records-toolbar';
import { useRecordSelection } from '@/components/datasets/use-record-selection';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { PagePager } from '@/components/ui/page-pager';
import { usePageSize } from '@/hooks/shared/use-page-size';
import { LogoLoader } from '@/components/ui/logo-loader';
import { Modal } from '@/components/ui/modal';
import { useDebounce } from '@/hooks/use-debounce';
import {
  useAdminDataset,
  useAdminDatasetMutations,
  useAdminDatasetRecords,
  useAdminDatasets,
} from '@/hooks/automation/use-admin-datasets';
import { btnGhost, btnPrimary, inputClass } from '@/app/[locale]/admin/_styles';
import { useApiErrorMessage } from '@/hooks/shared/use-api-error-message';
import { ConnectedWorkflowsSection } from './connected-workflows-section';
import { SchemaBuilder } from './schema-builder';


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
  const t = useTranslations('Datasets');
  const getApiErrorMessage = useApiErrorMessage();
  const { data: dataset, isLoading } = useAdminDataset(organizationId, datasetId);
  // El límite de filas es por organización, no por catálogo: se pide de la misma lista que ya
  // usa la pantalla de "Catálogos" en vez de exponer un endpoint nuevo solo para esto.
  const { data: list } = useAdminDatasets(organizationId);
  const usage = list?.usage;
  const atRowLimit = !!usage && usage.writesBlocked;

  const { pageSize, setPageSize } = usePageSize('admin-catalog-records');
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 400);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const { data: records } = useAdminDatasetRecords(
    organizationId,
    datasetId,
    pageSize,
    (page - 1) * pageSize,
    search,
  );
  const {
    updateFields,
    deleteDataset,
    clearRecords,
    createRecord,
    updateRecord,
    deleteRecords,
    importCsv,
  } = useAdminDatasetMutations();

  const selection = useRecordSelection(
    (records?.items ?? []).map((record) => record.id),
    `${page}|${pageSize}|${search}`,
  );

  const [isEditingSchema, setIsEditingSchema] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [clearConfirmName, setClearConfirmName] = useState('');
  const [draftFields, setDraftFields] = useState<DatasetField[]>([]);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);

  useEffect(() => {
    if (dataset) setDraftFields(dataset.fields);
  }, [dataset]);

  if (isLoading || !dataset) {
    return (
      <div className="flex justify-center py-16">
        <LogoLoader text={t('loadingDataset')} />
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
      setSchemaError(getApiErrorMessage(caught as any));
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
      toast.error(t('deleteDatasetError'));
    }
  };

  const handleDeleteSelected = async () => {
    try {
      const { deleted } = await deleteRecords.mutateAsync({
        organizationId,
        id: datasetId,
        recordIds: selection.selectedVisibleIds,
      });
      selection.clear();
      setIsDeletingSelected(false);
      toast.success(t('deleteSelectedSuccess', { count: deleted }));
    } catch {
      toast.error(t('deleteSelectedError'));
    }
  };

  const closeClear = () => {
    setIsClearing(false);
    setClearConfirmName('');
  };

  const canClear = clearConfirmName.trim() === dataset.name.trim();

  const handleClear = async () => {
    if (!canClear) return;
    try {
      await clearRecords.mutateAsync({ organizationId, id: datasetId });
      closeClear();
    } catch {
      toast.error(t('clearDataError'));
    }
  };

  const totalPages = Math.max(1, Math.ceil((records?.total ?? 0) / pageSize));

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button
            onClick={onBack}
            className="mb-2 flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft size={14} /> {t('backToDatasets')}
          </button>
          <h2 className="text-base font-semibold text-text-primary">{dataset.name}</h2>
          {dataset.description && <p className="mt-1 max-w-2xl text-sm text-text-secondary">{dataset.description}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <button className={btnGhost} onClick={() => setIsEditingSchema(true)}>
            <Settings2 size={14} /> {t('columnsLabel')}
          </button>
          <button
            className={btnGhost}
            onClick={() => setIsImporting(true)}
            disabled={atRowLimit}
            title={atRowLimit ? t('writesBlocked') : undefined}
          >
            <FileUp size={14} /> {t('import')}
          </button>
          <button
            onClick={() => setIsClearing(true)}
            className="hover:bg-danger/10 flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-danger-600"
          >
            <Eraser size={14} /> {t('clearData')}
          </button>
          <button
            onClick={() => setIsDeleting(true)}
            className="hover:bg-danger/10 flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-danger-600"
          >
            <Trash2 size={14} /> {t('delete')}
          </button>
        </div>
      </div>

      <ConnectedWorkflowsSection organizationId={organizationId} datasetId={datasetId} workflows={dataset.workflows} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">
            {t('rowsHeading', { count: records?.total ?? 0 })}
          </h3>
          <PagePager
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            emphasis="plain"
            className="shrink-0"
          />
        </div>

        {usage && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm">
            <span className="text-text-tertiary">{t('rowsUsageLabel')}</span>
            <span className="font-medium text-text-primary">
              {usage.rows} / {usage.maxDatasetRows === -1 ? '∞' : usage.maxDatasetRows}
            </span>
            {atRowLimit && (
              <span className="rounded-lg bg-warning-500/10 px-2 py-1 text-xs font-medium text-warning-600">
                {t('rowsBlockedBadge')}
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
          canDelete
        />

        <RecordsGrid
          fields={dataset.fields}
          records={records?.items ?? []}
          createDisabledReason={atRowLimit ? t('writesBlocked') : undefined}
          selection={selection}
          onCreate={async (data) => {
            await createRecord.mutateAsync({ organizationId, id: datasetId, data });
          }}
          onUpdate={async (recordId, data) => {
            await updateRecord.mutateAsync({ organizationId, id: datasetId, recordId, data });
          }}
        />
      </section>

      <Modal isOpen={isEditingSchema} onClose={closeSchemaEditor} title={t('editColumns')} size="lg">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">{t('schemaEditIntro')}</p>

          <SchemaBuilder fields={draftFields} onChange={setDraftFields} savedFields={dataset.fields} />

          {overwriteConfirmed && columnsLosingManualValues.length > 0 && (
            <div className="bg-warning/10 rounded-lg px-4 py-3 text-sm text-warning-600">
              {t('schemaOverwriteWarning', {
                columns: columnsLosingManualValues.join(', '),
                count: dataset.recordCount,
              })}
            </div>
          )}

          {schemaError && <div className="bg-danger/10 rounded-lg px-4 py-3 text-sm text-danger-600">{schemaError}</div>}

          <div className="flex justify-end gap-2">
            <button className={btnGhost} onClick={closeSchemaEditor}>
              {t('cancel')}
            </button>
            <button className={btnPrimary} onClick={saveSchema} disabled={updateFields.isPending}>
              {overwriteConfirmed && columnsLosingManualValues.length > 0
                ? t('confirmAndOverwrite')
                : t('save')}
            </button>
          </div>
        </div>
      </Modal>

      <ImportCsvModal
        isOpen={isImporting}
        onClose={() => setIsImporting(false)}
        fields={dataset.fields}
        onImport={({ csv, fileName }) =>
          importCsv.mutateAsync({ organizationId, id: datasetId, csv, fileName })
        }
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

      <Modal isOpen={isDeleting} onClose={closeDelete} title={t('deleteDatasetTitle')}>
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            {t('deleteDatasetBody', { name: dataset.name, count: records?.total ?? 0 })}
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
              {t('cancel')}
            </button>
            <button
              onClick={handleDelete}
              disabled={!canDelete || deleteDataset.isPending}
              className="flex items-center gap-2 rounded-lg bg-danger-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {deleteDataset.isPending && <Loader2 size={16} className="animate-spin" />}
              {deleteDataset.isPending ? t('deletingDataset') : t('delete')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isClearing} onClose={closeClear} title={t('clearDataTitle')}>
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            {t('clearDataBody', { name: dataset.name, count: records?.total ?? 0 })}
          </p>
          <input
            value={clearConfirmName}
            onChange={(e) => setClearConfirmName(e.target.value)}
            autoComplete="off"
            className={inputClass}
            placeholder={dataset.name}
          />
          <div className="flex justify-end gap-2">
            <button className={btnGhost} onClick={closeClear}>
              {t('cancel')}
            </button>
            <button
              onClick={handleClear}
              disabled={!canClear || clearRecords.isPending}
              className="flex items-center gap-2 rounded-lg bg-danger-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {clearRecords.isPending && <Loader2 size={16} className="animate-spin" />}
              {clearRecords.isPending ? t('clearingData') : t('clearData')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
