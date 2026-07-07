'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, DollarSign, Power, Search } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { LogoLoader } from '@/components/ui/logo-loader';
import { useLlmModels, useLlmModelMutations } from '@/hooks/automation/use-llm-models';
import type {
  LlmModel,
  ModelTier,
  CreateLlmModelInput,
} from '@/lib/api/endpoints/automation/llm-models/llm-models-api';

const TIERS: ModelTier[] = ['BASIC', 'STANDARD', 'PREMIUM'];

const inputClass =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary';
const labelClass = 'mb-1 block text-xs font-medium text-text-secondary';
const btnPrimary =
  'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50';
const btnGhost =
  'inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-text-primary transition-colors hover:bg-surface-secondary';

function fmtPrice(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : v;
}

export default function LlmModelsAdminPage() {
  const [providerFilter, setProviderFilter] = useState('');
  const [tierFilter, setTierFilter] = useState<ModelTier | ''>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');

  const query = {
    provider: providerFilter || undefined,
    tier: tierFilter || undefined,
    isActive: activeFilter === 'all' ? undefined : activeFilter === 'active',
    limit: 100,
  };

  const { data, isLoading, isError } = useLlmModels(query);
  const { createModel, updateModel, supersedePricing, deactivateModel } = useLlmModelMutations();

  const [createOpen, setCreateOpen] = useState(false);
  const [editModel, setEditModel] = useState<LlmModel | null>(null);
  const [priceModel, setPriceModel] = useState<LlmModel | null>(null);

  const models = data?.data ?? [];

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
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
          />
          <input
            className={`${inputClass} pl-9`}
            placeholder="Filtrar por provider"
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
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
                  <td className="px-4 py-3 text-text-secondary">{fmtPrice(m.inputPricePer1m)}</td>
                  <td className="px-4 py-3 text-text-secondary">{fmtPrice(m.outputPricePer1m)}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {m.contextWindow.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        m.isActive
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
                        title="Editar metadatos"
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
                        onClick={() => {
                          if (confirm(`¿Desactivar ${m.provider}/${m.modelName}?`)) {
                            deactivateModel.mutate(m.id, {
                              onSuccess: () => toast.success('Modelo desactivado'),
                              onError: (e: any) =>
                                !e?.toastHandled && toast.error('No se pudo desactivar'),
                            });
                          }
                        }}
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
      </div>

      {/* Modal: crear */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo modelo LLM">
        <CreateForm
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

      {/* Modal: editar metadatos */}
      <Modal
        isOpen={!!editModel}
        onClose={() => setEditModel(null)}
        title={editModel ? `Editar ${editModel.modelName}` : ''}
      >
        {editModel && (
          <EditForm
            model={editModel}
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
        )}
      </Modal>

      {/* Modal: cambio de precio versionado */}
      <Modal
        isOpen={!!priceModel}
        onClose={() => setPriceModel(null)}
        title={priceModel ? `Cambiar precio · ${priceModel.modelName}` : ''}
      >
        {priceModel && (
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
        )}
      </Modal>
    </div>
  );
}

// ── Formularios ──────────────────────────────────────────────────────────────

function CreateForm({
  onSubmit,
  onCancel,
  pending,
}: {
  onSubmit: (input: CreateLlmModelInput) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [f, setF] = useState({
    provider: '',
    modelName: '',
    tier: 'STANDARD' as ModelTier,
    category: '',
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
      category: f.category.trim() || undefined,
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
        <div>
          <label className={labelClass}>Categoría (opcional)</label>
          <input
            className={inputClass}
            value={f.category}
            onChange={(e) => setF({ ...f, category: e.target.value })}
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
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className={btnGhost} onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className={btnPrimary} disabled={pending}>
          {pending ? 'Creando…' : 'Crear'}
        </button>
      </div>
    </form>
  );
}

function EditForm({
  model,
  onSubmit,
  onCancel,
  pending,
}: {
  model: LlmModel;
  onSubmit: (patch: {
    tier?: ModelTier;
    category?: string;
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
    category: model.category ?? '',
    contextWindow: String(model.contextWindow),
    recommendedMaxTokens: String(model.recommendedMaxTokens),
    notes: model.notes ?? '',
    isActive: model.isActive,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      tier: f.tier,
      category: f.category.trim() || undefined,
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
        <div>
          <label className={labelClass}>Categoría</label>
          <input
            className={inputClass}
            value={f.category}
            onChange={(e) => setF({ ...f, category: e.target.value })}
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
      <label className="flex items-center gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          checked={f.isActive}
          onChange={(e) => setF({ ...f, isActive: e.target.checked })}
        />
        Activo
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className={btnGhost} onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className={btnPrimary} disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar'}
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
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className={btnGhost} onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className={btnPrimary} disabled={pending}>
          {pending ? 'Actualizando…' : 'Actualizar precio'}
        </button>
      </div>
    </form>
  );
}
