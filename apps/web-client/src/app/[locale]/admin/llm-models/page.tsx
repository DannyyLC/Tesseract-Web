'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, DollarSign, Power, Search, AlertTriangle } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { Modal } from '@/components/ui/modal';
import { LogoLoader } from '@/components/ui/logo-loader';
import { useLlmModels, useLlmModelMutations } from '@/hooks/automation/use-llm-models';
import { useInfiniteLlmCategories } from '@/hooks/automation/use-llm-categories';
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
const btnGhost =
  'inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-text-primary transition-colors hover:bg-surface-secondary';

function fmtPrice(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : v;
}

export default function LlmModelsAdminPage() {
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
    limit: 20,
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
    { label: 'Todas las categorías', value: '' },
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
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Modelos LLM</h1>
          <p className="text-sm text-text-secondary">
            Administra los modelos disponibles y sus precios.
          </p>
        </div>
        <button className={btnPrimary} onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> Nuevo modelo
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
            placeholder="Buscar por proveedor o modelo..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
        </div>
        <select
          className={inputClass + ' w-auto'}
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value as ModelTier | '')}
        >
          <option value="">Todos los tiers</option>
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
          placeholder="Todas las categorías"
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
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="all">Todos</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <LogoLoader text="Cargando modelos" />
          </div>
        ) : isError ? (
          <p className="py-16 text-center text-sm text-text-secondary">
            No se pudieron cargar los modelos.
          </p>
        ) : models.length === 0 ? (
          <p className="py-16 text-center text-sm text-text-secondary">Sin modelos.</p>
        ) : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Modelo</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Input /1M</th>
                <th className="px-4 py-3">Output /1M</th>
                <th className="px-4 py-3">Contexto</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
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
                      {m.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        title="Editar"
                        className="rounded-lg p-2 text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                        onClick={() => setEditModel(m)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        title="Cambiar precio"
                        className="rounded-lg p-2 text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                        onClick={() => setPriceModel(m)}
                      >
                        <DollarSign size={16} />
                      </button>
                      <button
                        title="Desactivar"
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
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border p-4">
            <button
              className={btnGhost}
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </button>
            <span className="text-sm font-medium text-text-secondary">
              Página {page} de {meta.totalPages}
            </span>
            <button
              className={btnGhost}
              disabled={page === meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </button>
          </div>
        )}
      </div>

      {/* Modal: crear */}
      <AnimatePresence>
        {createOpen && (
          <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo modelo LLM">
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
                    toast.success('Modelo creado');
                    setCreateOpen(false);
                  },
                  onError: (e: any) =>
                    !e?.toastHandled && toast.error(e?.message || 'No se pudo crear'),
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
            title={`Editar ${editModel.modelName}`}
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
                      toast.success('Modelo actualizado');
                      setEditModel(null);
                    },
                    onError: (e: any) =>
                      !e?.toastHandled && toast.error(e?.message || 'No se pudo actualizar'),
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
            title={`Cambiar precio · ${priceModel.modelName}`}
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
                      toast.success('Precio actualizado (nueva versión creada)');
                      setPriceModel(null);
                    },
                    onError: (e: any) =>
                      !e?.toastHandled && toast.error(e?.message || 'No se pudo actualizar el precio'),
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
            title="Confirmar desactivación"
          >
            <div className="space-y-4">
              <div className="bg-danger/10 flex items-center gap-3 rounded-xl p-4 text-danger-600">
                <AlertTriangle size={24} />
                <p className="text-sm font-medium">¿Estás seguro de que deseas desactivar este modelo?</p>
              </div>

              <p className="text-center text-sm text-text-secondary">
                Se desactivará el modelo <strong>{deactivateModelConfirm.provider}/{deactivateModelConfirm.modelName}</strong>.
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-surface-secondary px-4 py-2 font-medium text-text-primary transition-colors hover:bg-surface-elevated"
                  onClick={() => setDeactivateModelConfirm(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2 font-medium text-brand-white transition-colors hover:bg-danger-600 disabled:opacity-50"
                  disabled={deactivateModel.isPending}
                  onClick={() => {
                    deactivateModel.mutate(deactivateModelConfirm.id, {
                      onSuccess: () => {
                        toast.success('Modelo desactivado');
                        setDeactivateModelConfirm(null);
                      },
                      onError: (e: any) => !e?.toastHandled && toast.error('No se pudo desactivar'),
                    });
                  }}
                >
                  {deactivateModel.isPending ? 'Desactivando…' : 'Desactivar modelo'}
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
          <label className={labelClass}>Provider</label>
          <input
            className={inputClass}
            required
            value={f.provider}
            onChange={(e) => setF({ ...f, provider: e.target.value })}
            placeholder="openai"
          />
        </div>
        <div>
          <label className={labelClass}>Nombre del modelo</label>
          <input
            className={inputClass}
            required
            value={f.modelName}
            onChange={(e) => setF({ ...f, modelName: e.target.value })}
            placeholder="gpt-4o"
          />
        </div>
        <div>
          <label className={labelClass}>Tier</label>
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
          <label className={labelClass}>Categoría (opcional)</label>
          <InfiniteSelect
            value={f.llmCategoryId}
            onChange={(val) => setF({ ...f, llmCategoryId: val })}
            options={[
              { label: 'Sin categoría', value: '' },
              ...categories.map((c) => ({ label: c.name, value: c.id })),
            ]}
            placeholder="Sin categoría"
            isLoading={isCategoriesLoading}
            fetchNextPage={fetchNextCategoryPage}
            hasNextPage={hasNextCategoryPage}
            isFetchingNextPage={isFetchingNextCategoryPage}
          />
        </div>
        <div>
          <label className={labelClass}>Precio input /1M</label>
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
          <label className={labelClass}>Precio output /1M</label>
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
          <label className={labelClass}>Ventana de contexto</label>
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
          <label className={labelClass}>Tokens recomendados</label>
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
        <label className={labelClass}>Notas (opcional)</label>
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
          Cancelar
        </button>
        <button 
          type="submit" 
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50" 
          disabled={pending}
        >
          {pending ? 'Creando…' : 'Crear modelo'}
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
        Para cambiar el precio usa la acción “Cambiar precio” (crea una versión nueva).
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Tier</label>
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
          <label className={labelClass}>Categoría</label>
          <InfiniteSelect
            value={f.llmCategoryId}
            onChange={(val) => setF({ ...f, llmCategoryId: val })}
            options={[
              { label: 'Sin categoría', value: '' },
              ...categories.map((c) => ({ label: c.name, value: c.id })),
            ]}
            placeholder="Sin categoría"
            isLoading={isCategoriesLoading}
            fetchNextPage={fetchNextCategoryPage}
            hasNextPage={hasNextCategoryPage}
            isFetchingNextPage={isFetchingNextCategoryPage}
          />
        </div>
        <div>
          <label className={labelClass}>Ventana de contexto</label>
          <input
            className={inputClass}
            type="number"
            min="1"
            value={f.contextWindow}
            onChange={(e) => setF({ ...f, contextWindow: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>Tokens recomendados</label>
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
        <label className={labelClass}>Notas</label>
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
          {f.isActive ? 'Activo' : 'Inactivo'}
        </span>
      </div>
      <div className="flex gap-3 pt-4">
        <button 
          type="button" 
          className="flex-1 rounded-xl bg-surface-secondary px-4 py-2 font-medium text-text-primary transition-colors hover:bg-surface-elevated" 
          onClick={onCancel}
        >
          Cancelar
        </button>
        <button 
          type="submit" 
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50" 
          disabled={pending}
        >
          {pending ? 'Guardando…' : 'Guardar cambios'}
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
        Se cerrará el precio vigente y se creará una nueva versión activa. El historial se conserva.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Precio input /1M</label>
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
          <label className={labelClass}>Precio output /1M</label>
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
        <label className={labelClass}>Notas (opcional)</label>
        <input
          className={inputClass}
          value={f.notes}
          onChange={(e) => setF({ ...f, notes: e.target.value })}
          placeholder="Motivo del cambio de precio"
        />
      </div>
      <div className="flex gap-3 pt-4">
        <button 
          type="button" 
          className="flex-1 rounded-xl bg-surface-secondary px-4 py-2 font-medium text-text-primary transition-colors hover:bg-surface-elevated" 
          onClick={onCancel}
        >
          Cancelar
        </button>
        <button 
          type="submit" 
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50" 
          disabled={pending}
        >
          {pending ? 'Actualizando…' : 'Actualizar precio'}
        </button>
      </div>
    </form>
  );
}
