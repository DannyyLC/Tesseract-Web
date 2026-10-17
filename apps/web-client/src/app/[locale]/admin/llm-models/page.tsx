'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plus, Pencil, DollarSign, Power, Search, AlertTriangle } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { Modal } from '@/components/ui/modal';
import { LogoLoader } from '@/components/ui/logo-loader';
import { PagePager } from '@/components/ui/page-pager';
import { usePageSize } from '@/hooks/shared/use-page-size';
import { useLlmModels, useLlmModelMutations } from '@/hooks/automation/use-llm-models';
import { useInfiniteLlmCategories } from '@/hooks/automation/use-llm-categories';
import { useApiErrorMessage } from '@/hooks/shared/use-api-error-message';
import { useDebounce } from '@/hooks/use-debounce';
import { InfiniteSelect } from '@/components/ui/infinite-select';
import type {
  LlmModel,
  ModelTier,
  CreateLlmModelInput,
} from '@/lib/api/endpoints/automation/llm-models/llm-models-api';
import type { LlmCategory } from '@/lib/api/endpoints/automation/llm-models/llm-categories-api';
import { isToastHandled } from '@/lib/api/api-error';

const TIERS: ModelTier[] = ['BASIC', 'STANDARD', 'PREMIUM'];

import {
  btnPrimary,
  emptyClass,
  filterSelectClass,
  iconBtn,
  iconBtnDanger,
  inputClass,
  labelClass,
  pageSubtitleClass,
  pageTitleClass,
  searchClass,
  searchIconClass,
  sectionClass,
  selectTriggerClass,
} from '../_styles';
import { LlmModelsOverviewCards } from '@/components/admin/llm-models/llm-models-overview-cards';

function fmtPrice(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : v;
}

/** `allowedParams` → texto editable: una línea `parametro: valor1, valor2` por parámetro. */
function formatAllowedParams(params: Record<string, string[]> | undefined): string {
  return Object.entries(params ?? {})
    .map(([name, values]) => (values.length ? `${name}: ${values.join(', ')}` : `${name}:`))
    .join('\n');
}

const PARAM_NAME = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * Texto del formulario → `allowedParams`. Misma forma que valida el gateway
 * (`IsAllowedParams`): nombres en snake_case y valores sin vacíos. Devuelve la línea
 * (1-based) del primer error para señalarla en el formulario.
 */
function parseAllowedParams(
  text: string,
): { ok: true; value: Record<string, string[]> } | { ok: false; line: number } {
  const value: Record<string, string[]> = {};
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const colon = raw.indexOf(':');
    const name = (colon === -1 ? raw : raw.slice(0, colon)).trim();
    if (!PARAM_NAME.test(name)) return { ok: false, line: i + 1 };
    const values =
      colon === -1
        ? []
        : raw
            .slice(colon + 1)
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean);
    value[name] = values;
  }
  return { ok: true, value };
}

/** Resumen en texto plano de las capacidades, para la tabla. */
function capabilitiesSummary(m: LlmModel, noTemperatureLabel: string): string {
  const parts: string[] = [];
  if (m.supportsTemperature === false) parts.push(noTemperatureLabel);
  parts.push(...Object.keys(m.allowedParams ?? {}));
  return parts.join(' · ');
}

/** Campos de capacidades compartidos por los formularios de crear y editar. */
function CapabilitiesFields({
  supportsTemperature,
  allowedParamsText,
  invalidLine,
  onChange,
}: {
  supportsTemperature: boolean;
  allowedParamsText: string;
  invalidLine: number | null;
  onChange: (patch: { supportsTemperature?: boolean; allowedParamsText?: string }) => void;
}) {
  const tt = useTranslations('Admin.LlmModels');
  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <label className="flex items-start gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={supportsTemperature}
          onChange={(e) => onChange({ supportsTemperature: e.target.checked })}
        />
        <span>
          {tt('supportsTemperatureLabel')}
          <span className="block text-xs text-text-secondary">{tt('supportsTemperatureHint')}</span>
        </span>
      </label>
      <div>
        <label className={labelClass}>{tt('allowedParamsLabel')}</label>
        <textarea
          className={`${inputClass} min-h-[72px] font-mono text-xs`}
          value={allowedParamsText}
          onChange={(e) => onChange({ allowedParamsText: e.target.value })}
          placeholder="reasoning_effort: none, low, medium, high"
          spellCheck={false}
        />
        {invalidLine !== null ? (
          <p className="mt-1 text-xs text-danger-500">
            {tt('allowedParamsInvalid', { line: invalidLine })}
          </p>
        ) : (
          <p className="mt-1 text-xs text-text-secondary">{tt('allowedParamsHint')}</p>
        )}
      </div>
    </div>
  );
}

export default function LlmModelsAdminPage() {
  const tt = useTranslations('Admin.LlmModels');
  const getApiErrorMessage = useApiErrorMessage();
  const [searchFilter, setSearchFilter] = useState('');
  const debouncedSearch = useDebounce(searchFilter, 400);

  const [tierFilter, setTierFilter] = useState<ModelTier | ''>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const { pageSize, setPageSize } = usePageSize('admin-llm-models');
  const [page, setPage] = useState(1);

  // Reiniciar a la página 1 cuando cambian los filtros
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, tierFilter, categoryFilter, activeFilter]);

  const query = {
    search: debouncedSearch || undefined,
    tier: tierFilter || undefined,
    llmCategoryId: categoryFilter || undefined,
    isActive: activeFilter === 'all' ? undefined : activeFilter === 'active',
    limit: pageSize,
    page,
  };

  const { data, isLoading, isError } = useLlmModels(query);
  const {
    data: categoriesPages,
    isLoading: isCategoriesLoading,
    fetchNextPage: fetchNextCategoryPage,
    hasNextPage: hasNextCategoryPage,
    isFetchingNextPage: isFetchingNextCategoryPage,
  } = useInfiniteLlmCategories({ isActive: true });

  const categories = categoriesPages?.pages.flatMap((p) => p.data) ?? [];
  const categoryOptions = [
    { label: tt('allCategories'), value: '' },
    ...categories.map((c) => ({ label: c.name, value: c.id })),
  ];

  const { createModel, updateModel, supersedePricing, deactivateModel } = useLlmModelMutations();

  const [createOpen, setCreateOpen] = useState(false);
  const [editModel, setEditModel] = useState<LlmModel | null>(null);
  const [priceModel, setPriceModel] = useState<LlmModel | null>(null);
  const [deactivateModelConfirm, setDeactivateModelConfirm] = useState<LlmModel | null>(null);

  const models = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={pageTitleClass}>{tt('title')}</h1>
          <p className={pageSubtitleClass}>{tt('subtitle')}</p>
        </div>
        <button className={btnPrimary} onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> {tt('newModel')}
        </button>
      </div>

      <LlmModelsOverviewCards />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[250px] flex-1">
          <Search size={16} className={searchIconClass} />
          <input
            className={searchClass}
            placeholder={tt('searchPlaceholder')}
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
        </div>
        <select
          className={`${filterSelectClass} w-auto`}
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value as ModelTier | '')}
        >
          <option value="">{tt('allTiers')}</option>
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <InfiniteSelect
          className="min-w-[200px] flex-1"
          triggerClassName={filterSelectClass}
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={categoryOptions}
          placeholder={tt('allCategories')}
          isLoading={isCategoriesLoading}
          fetchNextPage={fetchNextCategoryPage}
          hasNextPage={hasNextCategoryPage}
          isFetchingNextPage={isFetchingNextCategoryPage}
        />
        <select
          className={`${filterSelectClass} w-auto`}
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as typeof activeFilter)}
        >
          <option value="active">{tt('statusActive')}</option>
          <option value="inactive">{tt('statusInactive')}</option>
          <option value="all">{tt('statusAll')}</option>
        </select>
      </div>

      {/* Tabla */}
      <div className={`${sectionClass} overflow-hidden`}>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <LogoLoader text={tt('loading')} />
          </div>
        ) : isError ? (
          <p className="py-16 text-center text-sm text-text-secondary">{tt('loadError')}</p>
        ) : models.length === 0 ? (
          <div className="p-6">
            <p className={emptyClass}>{tt('empty')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
                <tr>
                  <th className="px-4 py-3 font-medium">{tt('colProvider')}</th>
                  <th className="px-4 py-3 font-medium">{tt('colModel')}</th>
                  <th className="px-4 py-3 font-medium">{tt('colTier')}</th>
                  <th className="px-4 py-3 font-medium">{tt('colCategory')}</th>
                  <th className="px-4 py-3 font-medium">{tt('colInput')}</th>
                  <th className="px-4 py-3 font-medium">{tt('colOutput')}</th>
                  <th className="px-4 py-3 font-medium">{tt('colContext')}</th>
                  <th className="px-4 py-3 font-medium">{tt('colStatus')}</th>
                  <th className="px-4 py-3 text-right font-medium">{tt('colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-border transition-colors last:border-0 hover:bg-surface-panel"
                  >
                    <td className="px-4 py-3 text-text-primary">{m.provider}</td>
                    <td className="px-4 py-3 font-medium text-text-primary">
                      {m.modelName}
                      {capabilitiesSummary(m, tt('capNoTemperature')) && (
                        <span className="block text-xs font-normal text-text-secondary">
                          {capabilitiesSummary(m, tt('capNoTemperature'))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{m.tier}</td>
                    <td className="px-4 py-3 text-text-secondary">{m.llmCategory?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-text-secondary">{fmtPrice(m.inputPricePer1m)}</td>
                    <td className="px-4 py-3 text-text-secondary">
                      {fmtPrice(m.outputPricePer1m)}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {m.contextWindow.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          m.isActive
                            ? 'bg-[var(--badge-success-bg-solid)] text-[var(--badge-success-text-solid)]'
                            : 'bg-[var(--surface-tint)] text-text-secondary'
                        }`}
                      >
                        {m.isActive ? tt('active') : tt('inactive')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          title={tt('editTitle')}
                          className={iconBtn}
                          onClick={() => setEditModel(m)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          title={tt('changePriceTitle')}
                          className={iconBtn}
                          onClick={() => setPriceModel(m)}
                        >
                          <DollarSign size={16} />
                        </button>
                        <button
                          title={tt('deactivateTitle')}
                          disabled={!m.isActive || deactivateModel.isPending}
                          className={iconBtnDanger}
                          onClick={() => setDeactivateModelConfirm(m)}
                        >
                          <Power size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {meta && (
          <PagePager
            page={page}
            totalPages={meta.totalPages}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            summary={tt('pagerSummary', { page, totalPages: meta.totalPages })}
            className="border-t border-border px-6 py-4"
          />
        )}
      </div>

      {/* Modal: crear */}
      <AnimatePresence>
        {createOpen && (
          <Modal
            isOpen={createOpen}
            onClose={() => setCreateOpen(false)}
            title={tt('newModelModalTitle')}
          >
            <CreateForm
              categories={categories}
              isCategoriesLoading={isCategoriesLoading}
              fetchNextCategoryPage={fetchNextCategoryPage}
              hasNextCategoryPage={hasNextCategoryPage}
              isFetchingNextCategoryPage={isFetchingNextCategoryPage}
              pending={createModel.isPending}
              onCancel={() => setCreateOpen(false)}
              onSubmit={(input) =>
                createModel.mutate(input, {
                  onSuccess: () => {
                    toast.success(tt('modelCreated'));
                    setCreateOpen(false);
                  },
                  onError: (e) => !isToastHandled(e) && toast.error(getApiErrorMessage(e)),
                })
              }
            />
          </Modal>
        )}
      </AnimatePresence>

      {/* Modal: editar metadatos */}
      <AnimatePresence>
        {editModel && (
          <Modal
            isOpen={!!editModel}
            onClose={() => setEditModel(null)}
            title={tt('editModalTitle', { name: editModel.modelName })}
          >
            <EditForm
              model={editModel}
              categories={categories}
              isCategoriesLoading={isCategoriesLoading}
              fetchNextCategoryPage={fetchNextCategoryPage}
              hasNextCategoryPage={hasNextCategoryPage}
              isFetchingNextCategoryPage={isFetchingNextCategoryPage}
              pending={updateModel.isPending}
              onCancel={() => setEditModel(null)}
              onSubmit={(patch) =>
                updateModel.mutate(
                  { id: editModel.id, data: patch },
                  {
                    onSuccess: () => {
                      toast.success(tt('modelUpdated'));
                      setEditModel(null);
                    },
                    onError: (e) => !isToastHandled(e) && toast.error(getApiErrorMessage(e)),
                  },
                )
              }
            />
          </Modal>
        )}
      </AnimatePresence>

      {/* Modal: cambio de precio versionado */}
      <AnimatePresence>
        {priceModel && (
          <Modal
            isOpen={!!priceModel}
            onClose={() => setPriceModel(null)}
            title={tt('changePriceModalTitle', { name: priceModel.modelName })}
          >
            <PriceForm
              model={priceModel}
              pending={supersedePricing.isPending}
              onCancel={() => setPriceModel(null)}
              onSubmit={(data) =>
                supersedePricing.mutate(
                  { id: priceModel.id, data },
                  {
                    onSuccess: () => {
                      toast.success(tt('priceUpdated'));
                      setPriceModel(null);
                    },
                    onError: (e) => !isToastHandled(e) && toast.error(getApiErrorMessage(e)),
                  },
                )
              }
            />
          </Modal>
        )}
      </AnimatePresence>

      {/* Modal: confirmar desactivar */}
      <AnimatePresence>
        {deactivateModelConfirm && (
          <Modal
            isOpen={!!deactivateModelConfirm}
            onClose={() => setDeactivateModelConfirm(null)}
            title={tt('confirmDeactivateTitle')}
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-[var(--danger-banner-border)] bg-[var(--danger-banner-bg)] p-4 text-[var(--danger-text-adaptive)]">
                <AlertTriangle size={24} />
                <p className="text-sm font-medium">{tt('confirmDeactivateWarning')}</p>
              </div>

              <p className="text-center text-sm text-text-secondary">
                {tt('confirmDeactivateBody', {
                  providerModel: `${deactivateModelConfirm.provider}/${deactivateModelConfirm.modelName}`,
                })}
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-surface-secondary px-4 py-2 font-medium text-text-primary transition-colors hover:bg-surface-elevated"
                  onClick={() => setDeactivateModelConfirm(null)}
                >
                  {tt('cancel')}
                </button>
                <button
                  type="button"
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2 font-medium text-brand-white transition-colors hover:bg-danger-600 disabled:opacity-50"
                  disabled={deactivateModel.isPending}
                  onClick={() => {
                    deactivateModel.mutate(deactivateModelConfirm.id, {
                      onSuccess: () => {
                        toast.success(tt('modelDeactivated'));
                        setDeactivateModelConfirm(null);
                      },
                      onError: (e) => !isToastHandled(e) && toast.error(tt('deactivateError')),
                    });
                  }}
                >
                  {deactivateModel.isPending ? tt('deactivating') : tt('deactivateModel')}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Formularios ──────────────────────────────────────────────────────────────

function CreateForm({
  categories,
  isCategoriesLoading,
  fetchNextCategoryPage,
  hasNextCategoryPage,
  isFetchingNextCategoryPage,
  onSubmit,
  onCancel,
  pending,
}: {
  categories: LlmCategory[];
  isCategoriesLoading?: boolean;
  fetchNextCategoryPage?: () => void;
  hasNextCategoryPage?: boolean;
  isFetchingNextCategoryPage?: boolean;
  onSubmit: (input: CreateLlmModelInput) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const tt = useTranslations('Admin.LlmModels');
  const [f, setF] = useState({
    provider: '',
    modelName: '',
    tier: 'STANDARD' as ModelTier,
    llmCategoryId: '',
    inputPricePer1m: '',
    outputPricePer1m: '',
    contextWindow: '',
    recommendedMaxTokens: '',
    currency: 'USD',
    notes: '',
    supportsTemperature: true,
    allowedParamsText: '',
  });
  const [invalidLine, setInvalidLine] = useState<number | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const allowedParams = parseAllowedParams(f.allowedParamsText);
    if (!allowedParams.ok) {
      setInvalidLine(allowedParams.line);
      return;
    }
    onSubmit({
      provider: f.provider.trim(),
      modelName: f.modelName.trim(),
      tier: f.tier,
      llmCategoryId: f.llmCategoryId || undefined,
      inputPricePer1m: Number(f.inputPricePer1m),
      outputPricePer1m: Number(f.outputPricePer1m),
      contextWindow: Number(f.contextWindow),
      recommendedMaxTokens: Number(f.recommendedMaxTokens),
      currency: f.currency.trim() || 'USD',
      notes: f.notes.trim() || undefined,
      supportsTemperature: f.supportsTemperature,
      allowedParams: allowedParams.value,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>{tt('providerLabel')}</label>
          <input
            className={inputClass}
            required
            value={f.provider}
            onChange={(e) => setF({ ...f, provider: e.target.value })}
            placeholder="openai"
          />
        </div>
        <div>
          <label className={labelClass}>{tt('modelNameLabel')}</label>
          <input
            className={inputClass}
            required
            value={f.modelName}
            onChange={(e) => setF({ ...f, modelName: e.target.value })}
            placeholder="gpt-4o"
          />
        </div>
        <div>
          <label className={labelClass}>{tt('tierLabel')}</label>
          <select
            className={inputClass}
            value={f.tier}
            onChange={(e) => setF({ ...f, tier: e.target.value as ModelTier })}
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="flex h-full flex-col">
          <label className={labelClass}>{tt('categoryOptionalLabel')}</label>
          <InfiniteSelect
            triggerClassName={selectTriggerClass}
            value={f.llmCategoryId}
            onChange={(val) => setF({ ...f, llmCategoryId: val })}
            options={[
              { label: tt('noCategoryOption'), value: '' },
              ...categories.map((c) => ({ label: c.name, value: c.id })),
            ]}
            placeholder={tt('noCategoryOption')}
            isLoading={isCategoriesLoading}
            fetchNextPage={fetchNextCategoryPage}
            hasNextPage={hasNextCategoryPage}
            isFetchingNextPage={isFetchingNextCategoryPage}
          />
        </div>
        <div>
          <label className={labelClass}>{tt('inputPriceLabel')}</label>
          <input
            className={inputClass}
            required
            type="number"
            step="0.000001"
            min="0"
            value={f.inputPricePer1m}
            onChange={(e) => setF({ ...f, inputPricePer1m: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>{tt('outputPriceLabel')}</label>
          <input
            className={inputClass}
            required
            type="number"
            step="0.000001"
            min="0"
            value={f.outputPricePer1m}
            onChange={(e) => setF({ ...f, outputPricePer1m: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>{tt('contextWindowLabel')}</label>
          <input
            className={inputClass}
            required
            type="number"
            min="1"
            value={f.contextWindow}
            onChange={(e) => setF({ ...f, contextWindow: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>{tt('recommendedTokensLabel')}</label>
          <input
            className={inputClass}
            required
            type="number"
            min="1"
            value={f.recommendedMaxTokens}
            onChange={(e) => setF({ ...f, recommendedMaxTokens: e.target.value })}
          />
        </div>
      </div>
      <CapabilitiesFields
        supportsTemperature={f.supportsTemperature}
        allowedParamsText={f.allowedParamsText}
        invalidLine={invalidLine}
        onChange={(patch) => {
          setF({ ...f, ...patch });
          if (patch.allowedParamsText !== undefined) setInvalidLine(null);
        }}
      />
      <div>
        <label className={labelClass}>{tt('notesOptionalLabel')}</label>
        <input
          className={inputClass}
          value={f.notes}
          onChange={(e) => setF({ ...f, notes: e.target.value })}
        />
      </div>
      <div className="flex gap-3 pt-4">
        <button
          type="button"
          className="flex-1 rounded-xl bg-surface-secondary px-4 py-2 font-medium text-text-primary transition-colors hover:bg-surface-elevated"
          onClick={onCancel}
        >
          {tt('cancel')}
        </button>
        <button
          type="submit"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending}
        >
          {pending ? tt('creating') : tt('createModel')}
        </button>
      </div>
    </form>
  );
}

function EditForm({
  model,
  categories,
  isCategoriesLoading,
  fetchNextCategoryPage,
  hasNextCategoryPage,
  isFetchingNextCategoryPage,
  onSubmit,
  onCancel,
  pending,
}: {
  model: LlmModel;
  categories: LlmCategory[];
  isCategoriesLoading?: boolean;
  fetchNextCategoryPage?: () => void;
  hasNextCategoryPage?: boolean;
  isFetchingNextCategoryPage?: boolean;
  onSubmit: (patch: {
    tier?: ModelTier;
    llmCategoryId?: string;
    contextWindow?: number;
    recommendedMaxTokens?: number;
    notes?: string;
    isActive?: boolean;
    supportsTemperature?: boolean;
    allowedParams?: Record<string, string[]>;
  }) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const tt = useTranslations('Admin.LlmModels');
  const [f, setF] = useState({
    tier: model.tier,
    llmCategoryId: model.llmCategoryId ?? '',
    contextWindow: String(model.contextWindow),
    recommendedMaxTokens: String(model.recommendedMaxTokens),
    notes: model.notes ?? '',
    isActive: model.isActive,
    supportsTemperature: model.supportsTemperature !== false,
    allowedParamsText: formatAllowedParams(model.allowedParams),
  });
  const [invalidLine, setInvalidLine] = useState<number | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const allowedParams = parseAllowedParams(f.allowedParamsText);
    if (!allowedParams.ok) {
      setInvalidLine(allowedParams.line);
      return;
    }
    onSubmit({
      tier: f.tier,
      llmCategoryId: f.llmCategoryId || undefined,
      contextWindow: Number(f.contextWindow),
      recommendedMaxTokens: Number(f.recommendedMaxTokens),
      notes: f.notes.trim() || undefined,
      isActive: f.isActive,
      supportsTemperature: f.supportsTemperature,
      allowedParams: allowedParams.value,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="rounded-xl bg-[var(--surface-tint)] px-3 py-2 text-xs text-text-secondary">
        {tt('editPriceHint')}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>{tt('tierLabel')}</label>
          <select
            className={inputClass}
            value={f.tier}
            onChange={(e) => setF({ ...f, tier: e.target.value as ModelTier })}
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="flex h-full flex-col">
          <label className={labelClass}>{tt('categoryLabel')}</label>
          <InfiniteSelect
            triggerClassName={selectTriggerClass}
            value={f.llmCategoryId}
            onChange={(val) => setF({ ...f, llmCategoryId: val })}
            options={[
              { label: tt('noCategoryOption'), value: '' },
              ...categories.map((c) => ({ label: c.name, value: c.id })),
            ]}
            placeholder={tt('noCategoryOption')}
            isLoading={isCategoriesLoading}
            fetchNextPage={fetchNextCategoryPage}
            hasNextPage={hasNextCategoryPage}
            isFetchingNextPage={isFetchingNextCategoryPage}
          />
        </div>
        <div>
          <label className={labelClass}>{tt('contextWindowLabel')}</label>
          <input
            className={inputClass}
            type="number"
            min="1"
            value={f.contextWindow}
            onChange={(e) => setF({ ...f, contextWindow: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>{tt('recommendedTokensLabel')}</label>
          <input
            className={inputClass}
            type="number"
            min="1"
            value={f.recommendedMaxTokens}
            onChange={(e) => setF({ ...f, recommendedMaxTokens: e.target.value })}
          />
        </div>
      </div>
      <CapabilitiesFields
        supportsTemperature={f.supportsTemperature}
        allowedParamsText={f.allowedParamsText}
        invalidLine={invalidLine}
        onChange={(patch) => {
          setF({ ...f, ...patch });
          if (patch.allowedParamsText !== undefined) setInvalidLine(null);
        }}
      />
      <div>
        <label className={labelClass}>{tt('notesLabel')}</label>
        <input
          className={inputClass}
          value={f.notes}
          onChange={(e) => setF({ ...f, notes: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={f.isActive}
          onClick={() => setF({ ...f, isActive: !f.isActive })}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            f.isActive ? 'bg-success-500' : 'bg-border-hover'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-surface-elevated transition-transform ${
              f.isActive ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        <span className="text-sm text-text-primary">
          {f.isActive ? tt('active') : tt('inactive')}
        </span>
      </div>
      <div className="flex gap-3 pt-4">
        <button
          type="button"
          className="flex-1 rounded-xl bg-surface-secondary px-4 py-2 font-medium text-text-primary transition-colors hover:bg-surface-elevated"
          onClick={onCancel}
        >
          {tt('cancel')}
        </button>
        <button
          type="submit"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending}
        >
          {pending ? tt('saving') : tt('saveChanges')}
        </button>
      </div>
    </form>
  );
}

function PriceForm({
  model,
  onSubmit,
  onCancel,
  pending,
}: {
  model: LlmModel;
  onSubmit: (data: { inputPricePer1m: number; outputPricePer1m: number; notes?: string }) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const tt = useTranslations('Admin.LlmModels');
  const [f, setF] = useState({
    inputPricePer1m: model.inputPricePer1m,
    outputPricePer1m: model.outputPricePer1m,
    notes: '',
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      inputPricePer1m: Number(f.inputPricePer1m),
      outputPricePer1m: Number(f.outputPricePer1m),
      notes: f.notes.trim() || undefined,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="rounded-xl bg-[var(--surface-tint)] px-3 py-2 text-xs text-text-secondary">
        {tt('priceChangeHint')}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>{tt('inputPriceLabel')}</label>
          <input
            className={inputClass}
            required
            type="number"
            step="0.000001"
            min="0"
            value={f.inputPricePer1m}
            onChange={(e) => setF({ ...f, inputPricePer1m: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>{tt('outputPriceLabel')}</label>
          <input
            className={inputClass}
            required
            type="number"
            step="0.000001"
            min="0"
            value={f.outputPricePer1m}
            onChange={(e) => setF({ ...f, outputPricePer1m: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className={labelClass}>{tt('notesOptionalLabel')}</label>
        <input
          className={inputClass}
          value={f.notes}
          onChange={(e) => setF({ ...f, notes: e.target.value })}
          placeholder={tt('priceChangeReasonPlaceholder')}
        />
      </div>
      <div className="flex gap-3 pt-4">
        <button
          type="button"
          className="flex-1 rounded-xl bg-surface-secondary px-4 py-2 font-medium text-text-primary transition-colors hover:bg-surface-elevated"
          onClick={onCancel}
        >
          {tt('cancel')}
        </button>
        <button
          type="submit"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending}
        >
          {pending ? tt('updating') : tt('updatePrice')}
        </button>
      </div>
    </form>
  );
}
