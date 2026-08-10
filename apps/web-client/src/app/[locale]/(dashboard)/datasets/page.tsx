'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Database, Plus, Rows3, Workflow } from 'lucide-react';
import { DatasetField } from '@tesseract/types';
import { Link, useRouter } from '@/i18n/routing';
import PermissionGuard from '@/components/auth/permission-guard';
import { Modal } from '@/components/ui/modal';
import { useDatasetMutations, useDatasets } from '@/hooks/automation/use-datasets';
import { SchemaBuilder } from './_components/schema-builder';

export default function DatasetsPage() {
  const t = useTranslations('Datasets');
  const router = useRouter();
  const { data, isLoading } = useDatasets();
  const { createDataset } = useDatasetMutations();

  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<DatasetField[]>([
    { key: '', label: '', type: 'text', order: 0 },
  ]);
  const [error, setError] = useState<string | null>(null);

  const usage = data?.usage;
  const atDatasetLimit =
    !!usage && usage.maxDatasets !== -1 && usage.datasets >= usage.maxDatasets;

  const handleCreate = async () => {
    setError(null);

    try {
      const created = await createDataset.mutateAsync({ name, description, fields });

      if (created) {
        setIsCreating(false);
        router.push(`/datasets/${created.id}`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('createError'));
    }
  };

  return (
    <PermissionGuard permissions="datasets:read" redirect fallbackRoute="/dashboard">
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{t('heading')}</h1>
            <p className="mt-1 text-sm text-text-secondary">{t('description')}</p>
          </div>

          <PermissionGuard permissions="datasets:create">
            <button
              onClick={() => setIsCreating(true)}
              disabled={atDatasetLimit}
              title={atDatasetLimit ? t('datasetLimitReached') : undefined}
              className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Plus size={16} />
              {t('newDataset')}
            </button>
          </PermissionGuard>
        </div>

        {/* El consumo va a la vista: un botón deshabilitado sin explicación es peor que el límite. */}
        {usage && (
          <div className="flex flex-wrap gap-6 rounded-2xl border border-border bg-surface-elevated px-5 py-4 text-sm">
            <div>
              <span className="text-text-tertiary">{t('usageDatasets')}: </span>
              <span className="font-medium text-text-primary">
                {usage.datasets} / {usage.maxDatasets === -1 ? '∞' : usage.maxDatasets}
              </span>
            </div>
            <div>
              <span className="text-text-tertiary">{t('usageRows')}: </span>
              <span className="font-medium text-text-primary">
                {usage.rows} / {usage.maxDatasetRows === -1 ? '∞' : usage.maxDatasetRows}
              </span>
            </div>

            {/* Estar por encima del límite no borra ni oculta nada: solo bloquea las altas. */}
            {usage.writesBlocked && (
              <span className="rounded-lg bg-warning-500/10 px-2 py-1 text-xs font-medium text-warning-600">
                {t('writesBlocked')}
              </span>
            )}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-text-tertiary">{t('loading')}</p>
        ) : data && data.datasets.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.datasets.map((dataset) => (
              <Link
                key={dataset.id}
                href={`/datasets/${dataset.id}`}
                className="group rounded-2xl border border-border bg-surface-elevated p-5 transition-colors hover:border-accent"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-[var(--surface-tint)] p-2 text-accent">
                    <Database size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-semibold text-text-primary">{dataset.name}</h2>
                    {dataset.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
                        {dataset.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-4 text-xs text-text-tertiary">
                  <span className="flex items-center gap-1">
                    <Rows3 size={14} />
                    {t('rowCount', { count: dataset.recordCount })}
                  </span>
                  <span>{t('columnCount', { count: dataset.fieldCount })}</span>
                  <span className="flex items-center gap-1">
                    <Workflow size={14} />
                    {t('workflowCount', { count: dataset.workflowIds.length })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border py-16 text-center">
            <Database size={32} className="mx-auto text-text-tertiary" />
            <h2 className="mt-4 font-semibold text-text-primary">{t('emptyTitle')}</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-text-secondary">{t('emptyBody')}</p>
          </div>
        )}
      </div>

      <Modal
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        title={t('newDataset')}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              {t('nameLabel')}
            </label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('namePlaceholder')}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              {t('descriptionLabel')}
            </label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              placeholder={t('descriptionPlaceholder')}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
            {/* La descripción entra en la descripción de la tool: es lo que le dice al modelo
                cuándo consultar este catálogo. */}
            <p className="mt-1 text-xs text-text-tertiary">{t('descriptionHint')}</p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-text-secondary">
              {t('columnsLabel')}
            </label>
            <SchemaBuilder fields={fields} onChange={setFields} />
          </div>

          {error && (
            <div className="bg-danger/10 rounded-xl px-4 py-3 text-sm text-danger-600">{error}</div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setIsCreating(false)}
              className="rounded-xl px-4 py-2 text-sm font-medium text-text-secondary hover:bg-[var(--surface-tint)]"
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim() || createDataset.isPending}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-text-inverse disabled:opacity-50"
            >
              {createDataset.isPending ? t('creating') : t('create')}
            </button>
          </div>
        </div>
      </Modal>
    </PermissionGuard>
  );
}
