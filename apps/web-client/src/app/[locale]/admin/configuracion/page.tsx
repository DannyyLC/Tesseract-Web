'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { LogoLoader } from '@/components/ui/logo-loader';
import { useLlmCategories, useLlmCategoryMutations } from '@/hooks/automation/use-llm-categories';
import type {
  LlmCategory,
  CreateLlmCategoryInput,
} from '@/lib/api/endpoints/automation/llm-models/llm-categories-api';

const inputClass =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border-focus';
const labelClass = 'mb-1 block text-xs font-medium text-text-secondary';
const btnPrimary =
  'inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50';
const btnGhost =
  'inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-text-primary transition-colors hover:bg-surface-secondary';

export default function AdminConfiguracionPage() {
  const { data: categories = [], isLoading, isError } = useLlmCategories();
  const { createCategory, updateCategory, deleteCategory } = useLlmCategoryMutations();

  const [createOpen, setCreateOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<LlmCategory | null>(null);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Configuración</h1>
        <p className="text-sm text-text-secondary">
          Ajustes globales de la plataforma. Aquí se gestionan las categorías de modelos LLM.
        </p>
      </div>

      {/* Categorías de modelos LLM */}
      <section className="rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Categorías de modelos LLM</h2>
            <p className="text-xs text-text-secondary">
              Agrupan los modelos (habilitan estadísticas y routing/failover a futuro).
            </p>
          </div>
          <button className={btnPrimary} onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> Nueva categoría
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <LogoLoader text="Cargando categorías" />
          </div>
        ) : isError ? (
          <p className="py-16 text-center text-sm text-text-secondary">
            No se pudieron cargar las categorías.
          </p>
        ) : categories.length === 0 ? (
          <p className="py-16 text-center text-sm text-text-secondary">
            Aún no hay categorías. Crea la primera.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">{c.name}</span>
                    {!c.isActive && (
                      <span className="rounded-full bg-gray-500/10 px-2 py-0.5 text-xs text-text-secondary">
                        Inactiva
                      </span>
                    )}
                    <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-xs text-text-secondary">
                      {c._count?.models ?? 0} modelo(s)
                    </span>
                  </div>
                  {c.description && (
                    <p className="truncate text-sm text-text-secondary">{c.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    title="Editar"
                    className="rounded-lg p-2 text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                    onClick={() => setEditCategory(c)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    title="Eliminar"
                    disabled={deleteCategory.isPending}
                    className="rounded-lg p-2 text-text-secondary hover:bg-red-500/10 hover:text-red-600 disabled:opacity-40"
                    onClick={() => {
                      const warn = c._count?.models
                        ? `\n\n${c._count.models} modelo(s) quedarán sin categoría.`
                        : '';
                      if (confirm(`¿Eliminar la categoría "${c.name}"?${warn}`)) {
                        deleteCategory.mutate(c.id, {
                          onSuccess: () => toast.success('Categoría eliminada'),
                          onError: (e: any) =>
                            !e?.toastHandled && toast.error('No se pudo eliminar'),
                        });
                      }
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Modal: crear */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Nueva categoría">
        <CategoryForm
          pending={createCategory.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(input) =>
            createCategory.mutate(input, {
              onSuccess: () => {
                toast.success('Categoría creada');
                setCreateOpen(false);
              },
              onError: (e: any) => !e?.toastHandled && toast.error(e?.message || 'No se pudo crear'),
            })
          }
        />
      </Modal>

      {/* Modal: editar */}
      <Modal
        isOpen={!!editCategory}
        onClose={() => setEditCategory(null)}
        title={editCategory ? `Editar "${editCategory.name}"` : ''}
      >
        {editCategory && (
          <CategoryForm
            category={editCategory}
            pending={updateCategory.isPending}
            onCancel={() => setEditCategory(null)}
            onSubmit={(input) =>
              updateCategory.mutate(
                { id: editCategory.id, data: input },
                {
                  onSuccess: () => {
                    toast.success('Categoría actualizada');
                    setEditCategory(null);
                  },
                  onError: (e: any) =>
                    !e?.toastHandled && toast.error(e?.message || 'No se pudo actualizar'),
                },
              )
            }
          />
        )}
      </Modal>
    </div>
  );
}

function CategoryForm({
  category,
  onSubmit,
  onCancel,
  pending,
}: {
  category?: LlmCategory;
  onSubmit: (input: CreateLlmCategoryInput) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [f, setF] = useState({
    name: category?.name ?? '',
    description: category?.description ?? '',
    isActive: category?.isActive ?? true,
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: f.name.trim(),
      description: f.description.trim() || undefined,
      isActive: f.isActive,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className={labelClass}>Nombre</label>
        <input
          className={inputClass}
          required
          minLength={2}
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          placeholder="chat, reasoning, ..."
        />
      </div>
      <div>
        <label className={labelClass}>Descripción (opcional)</label>
        <input
          className={inputClass}
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
          placeholder="Ej: modelos rápidos para respuestas cortas"
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
          {f.isActive ? 'Activa' : 'Inactiva'}
        </span>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className={btnGhost} onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className={btnPrimary} disabled={pending}>
          {pending ? 'Guardando…' : category ? 'Guardar' : 'Crear'}
        </button>
      </div>
    </form>
  );
}
