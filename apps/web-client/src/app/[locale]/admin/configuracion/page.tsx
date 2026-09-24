'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { Modal } from '@/components/ui/modal';
import { LogoLoader } from '@/components/ui/logo-loader';
import { PagePager } from '@/components/ui/page-pager';
import { usePageSize } from '@/hooks/shared/use-page-size';
import { useLlmCategories, useLlmCategoryMutations } from '@/hooks/automation/use-llm-categories';
import { useApiErrorMessage } from '@/hooks/shared/use-api-error-message';
import type {
  LlmCategory,
  CreateLlmCategoryInput,
} from '@/lib/api/endpoints/automation/llm-models/llm-categories-api';

const inputClass =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border-focus';
const labelClass = 'mb-1 block text-xs font-medium text-text-secondary';
const btnPrimary =
  'inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50';

export default function AdminConfiguracionPage() {
  const tt = useTranslations('Admin.Configuration');
  const getApiErrorMessage = useApiErrorMessage();
  const { pageSize, setPageSize } = usePageSize('admin-llm-categories');
  const [page, setPage] = useState(1);
  const { data: response, isLoading, isError } = useLlmCategories({ page, limit: pageSize });
  const categories = response?.data ?? [];
  const meta = response?.meta;
  const { createCategory, updateCategory, deleteCategory } = useLlmCategoryMutations();

  const [createOpen, setCreateOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<LlmCategory | null>(null);
  const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState<LlmCategory | null>(null);

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">{tt('title')}</h1>
        <p className="text-sm text-text-secondary">{tt('subtitle')}</p>
      </div>

      {/* Categorías de modelos LLM */}
      <section className="rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">{tt('categoriesTitle')}</h2>
            <p className="text-xs text-text-secondary">{tt('categoriesSubtitle')}</p>
          </div>
          <button className={btnPrimary} onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> {tt('newCategory')}
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <LogoLoader text={tt('loading')} />
          </div>
        ) : isError ? (
          <p className="py-16 text-center text-sm text-text-secondary">{tt('loadError')}</p>
        ) : categories.length === 0 ? (
          <p className="py-16 text-center text-sm text-text-secondary">{tt('empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">{c.name}</span>
                    {!c.isActive && (
                      <span className="rounded-full bg-gray-500/10 px-2 py-0.5 text-xs text-text-secondary">
                        {tt('inactiveBadge')}
                      </span>
                    )}
                    <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-xs text-text-secondary">
                      {tt('modelsCount', { count: c._count?.models ?? 0 })}
                    </span>
                  </div>
                  {c.description && (
                    <p className="truncate text-sm text-text-secondary">{c.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    title={tt('editTitle')}
                    className="rounded-lg p-2 text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                    onClick={() => setEditCategory(c)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    title={tt('deleteTitle')}
                    disabled={deleteCategory.isPending}
                    className="rounded-lg p-2 text-text-secondary hover:bg-red-500/10 hover:text-red-600 disabled:opacity-40"
                    onClick={() => setDeleteCategoryConfirm(c)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
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
            className="border-t border-border p-4"
          />
        )}
      </section>

      {/* Modal: crear */}
      <AnimatePresence>
        {createOpen && (
          <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title={tt('newCategoryModalTitle')}>
            <CategoryForm
              pending={createCategory.isPending}
              onCancel={() => setCreateOpen(false)}
              onSubmit={(input) =>
                createCategory.mutate(input, {
                  onSuccess: () => {
                    toast.success(tt('categoryCreated'));
                    setCreateOpen(false);
                  },
                  onError: (e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)),
                })
              }
            />
          </Modal>
        )}
      </AnimatePresence>

      {/* Modal: editar */}
      <AnimatePresence>
        {editCategory && (
          <Modal
            isOpen={!!editCategory}
            onClose={() => setEditCategory(null)}
            title={tt('editCategoryModalTitle', { name: editCategory.name })}
          >
            <CategoryForm
              category={editCategory}
              pending={updateCategory.isPending}
              onCancel={() => setEditCategory(null)}
              onSubmit={(input) =>
                updateCategory.mutate(
                  { id: editCategory.id, data: input },
                  {
                    onSuccess: () => {
                      toast.success(tt('categoryUpdated'));
                      setEditCategory(null);
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

      {/* Modal: confirmar eliminar */}
      <AnimatePresence>
        {deleteCategoryConfirm && (
          <Modal
            isOpen={!!deleteCategoryConfirm}
            onClose={() => setDeleteCategoryConfirm(null)}
            title={tt('confirmDeleteTitle')}
          >
            <div className="space-y-4">
              <div className="bg-danger/10 flex items-center gap-3 rounded-xl p-4 text-danger-600">
                <AlertTriangle size={24} />
                <p className="text-sm font-medium">{tt('confirmDeleteWarning')}</p>
              </div>

              <p className="text-center text-sm text-text-secondary">
                {tt('confirmDeleteBody', { name: deleteCategoryConfirm.name })}
                {deleteCategoryConfirm._count?.models ? (
                  <span className="mt-2 block font-medium text-danger-600">
                    {tt('confirmDeleteModelsWarning', { count: deleteCategoryConfirm._count.models })}
                  </span>
                ) : null}
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-surface-secondary px-4 py-2 font-medium text-text-primary transition-colors hover:bg-surface-elevated"
                  onClick={() => setDeleteCategoryConfirm(null)}
                >
                  {tt('cancel')}
                </button>
                <button
                  type="button"
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2 font-medium text-brand-white transition-colors hover:bg-danger-600 disabled:opacity-50"
                  disabled={deleteCategory.isPending}
                  onClick={() => {
                    deleteCategory.mutate(deleteCategoryConfirm.id, {
                      onSuccess: () => {
                        toast.success(tt('categoryDeleted'));
                        setDeleteCategoryConfirm(null);
                      },
                      onError: (e: any) => !e?.toastHandled && toast.error(tt('deleteError')),
                    });
                  }}
                >
                  {deleteCategory.isPending ? tt('deleting') : tt('deleteCategory')}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
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
  const tt = useTranslations('Admin.Configuration');
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
        <label className={labelClass}>{tt('nameLabel')}</label>
        <input
          className={inputClass}
          required
          minLength={2}
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          placeholder={tt('namePlaceholder')}
        />
      </div>
      <div>
        <label className={labelClass}>{tt('descriptionOptionalLabel')}</label>
        <input
          className={inputClass}
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
          placeholder={tt('descriptionPlaceholder')}
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
          {pending ? tt('saving') : category ? tt('saveChanges') : tt('createCategory')}
        </button>
      </div>
    </form>
  );
}
