'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ADMIN_PAGE_SIZE } from '@tesseract/types';
import { toast } from 'sonner';
import { Plus, Pencil, DollarSign, Power, Search, AlertTriangle } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { Modal } from '@/components/ui/modal';
import { LogoLoader } from '@/components/ui/logo-loader';
import { PagePager } from '@/components/ui/page-pager';
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

const TIERS: ModelTier[] = ['BASIC', 'STANDARD', 'PREMIUM'];

const inputClass =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border-focus';
const labelClass = 'mb-1 block text-xs font-medium text-text-secondary';
const btnPrimary =
  'inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50';

function fmtPrice(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : v;
}

export default function LlmModelsAdminPage() {
  const tt = useTranslations('Admin.LlmModels');
  const getApiErrorMessage = useApiErrorMessage();
  const [searchFilter, setSearchFilter] = useState('');
  const debouncedSearch = useDebounce(searchFilter, 400);

  const [tierFilter, setTierFilter] = useState<ModelTier | ''>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');
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
    limit: ADMIN_PAGE_SIZE,
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
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{tt('title')}</h1>
          <p className="text-sm text-text-secondary">{tt('subtitle')}</p>
        </div>
        <button className={btnPrimary} onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> {tt('newModel')}
        </button>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[250px]">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
          />
          <input
            className={`${inputClass} pl-9 w-full`}
            placeholder={tt('searchPlaceholder')}
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
        </div>
        <select
          className={inputClass + ' w-auto'}
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
          className="flex-1 min-w-[200px]"
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
          className={inputClass + ' w-auto'}
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as typeof activeFilter)}
        >
          <option value="active">{tt('statusActive')}</option>
          <option value="inactive">{tt('statusInactive')}</option>
          <option value="all">{tt('statusAll')}</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <LogoLoader text={tt('loading')} />
          </div>
        ) : isError ? (
          <p className="py-16 text-center text-sm text-text-secondary">{tt('loadError')}</p>
        ) : models.length === 0 ? (
          <p className="py-16 text-center text-sm text-text-secondary">{tt('empty')}</p>
        ) : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-3">{tt('colProvider')}</th>
                <th className="px-4 py-3">{tt('colModel')}</th>
                <th className="px-4 py-3">{tt('colTier')}</th>
                <th className="px-4 py-3">{tt('colCategory')}</th>
                <th className="px-4 py-3">{tt('colInput')}</th>
                <th className="px-4 py-3">{tt('colOutput')}</th>
                <th className="px-4 py-3">{tt('colContext')}</th>
                <th className="px-4 py-3">{tt('colStatus')}</th>
                <th className="px-4 py-3 text-right">{tt('colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-text-primary">{m.provider}</td>
                  <td className="px-4 py-3 font-medium text-text-primary">{m.modelName}</td>
                  <td className="px-4 py-3 text-text-secondary">{m.tier}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {m.llmCategory?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{fmtPrice(m.inputPricePer1m)}</td>
                  <td className="px-4 py-3 text-text-secondary">{fmtPrice(m.outputPricePer1m)}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {m.contextWindow.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${m.isActive
                          ? 'bg-green-500/10 text-green-600'
                          : 'bg-gray-500/10 text-text-secondary'
                        }`}
                    >
                      {m.isActive ? tt('active') : tt('inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        title={tt('editTitle')}
                        className="rounded-lg p-2 text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                        onClick={() => setEditModel(m)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        title={tt('changePriceTitle')}
                        className="rounded-lg p-2 text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                        onClick={() => setPriceModel(m)}
                      >
                        <DollarSign size={16} />
                      </button>
                      <button
                        title={tt('deactivateTitle')}
                        disabled={!m.isActive || deactivateModel.isPending}
                        className="rounded-lg p-2 text-text-secondary hover:bg-red-500/10 hover:text-red-600 disabled:opacity-40"
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
        )}
        
        {/* Paginación */}
        {meta && (
          <PagePager
            page={page}
            totalPages={meta.totalPages}
            onPageChange={setPage}
            summary={tt('pagerSummary', { page, totalPages: meta.totalPages })}
            className="border-t border-border p-4"
          />
        )}
      </div>

      {/* Modal: crear */}
      <AnimatePresence>
        {createOpen && (
          <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title={tt('newModelModalTitle')}>
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
                  onError: (e: any) =>
                    !e?.toastHandled && toast.error(getApiErrorMessage(e)),
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
                    onError: (e: any) =>
                      !e?.toastHandled && toast.error(getApiErrorMessage(e)),
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
                    onError: (e: any) =>
                      !e?.toastHandled && toast.error(getApiErrorMessage(e)),
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
              <div className="bg-danger/10 flex items-center gap-3 rounded-xl p-4 text-danger-600">
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
                      onError: (e: any) => !e?.toastHandled && toast.error(tt('deactivateError')),
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
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
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
        <div className="flex flex-col h-full">
          <label className={labelClass}>{tt('categoryOptionalLabel')}</label>
          <InfiniteSelect
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
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      tier: f.tier,
      llmCategoryId: f.llmCategoryId || undefined,
      contextWindow: Number(f.contextWindow),
      recommendedMaxTokens: Number(f.recommendedMaxTokens),
      notes: f.notes.trim() || undefined,
      isActive: f.isActive,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="rounded-lg bg-surface-secondary p-2 text-xs text-text-secondary">
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
        <div className="flex flex-col h-full">
          <label className={labelClass}>{tt('categoryLabel')}</label>
          <InfiniteSelect
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
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${f.isActive ? 'bg-success-500' : 'bg-border-hover'
            }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-surface-elevated transition-transform ${f.isActive ? 'translate-x-6' : 'translate-x-1'
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
      <p className="rounded-lg bg-surface-secondary p-2 text-xs text-text-secondary">
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
