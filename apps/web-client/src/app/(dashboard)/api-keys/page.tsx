'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  Key,
  Trash2,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  Workflow,
  Edit2,
  Power,
} from 'lucide-react';
import { useApiKeysList, useApiKeyMutations } from '@/hooks/useApiKey';
import { useInfiniteDashboardWorkflows } from '@/hooks/useWorkflows';
import { ApiKeyListDto } from '@tesseract/types';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { LogoLoader } from '@/components/ui/logo-loader';

// --- Helper Components ---
const CopyButton = ({ text, className = '' }: { text: string; className?: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copiado al portapapeles');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button onClick={handleCopy} className={className} title="Copiar">
      {copied ? (
        <div className="flex items-center gap-1.5 text-emerald-500">
          <Check size={14} />
          <span className="text-xs font-medium">Copiado</span>
        </div>
      ) : (
        <Copy size={14} />
      )}
    </button>
  );
};

export default function ApiKeysPage() {
  const [searchQuery, setSearchQuery] = useState('');

  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);

  // Selected Data
  const [selectedKey, setSelectedKey] = useState<ApiKeyListDto | null>(null);
  const [createdKeyToken, setCreatedKeyToken] = useState<string>('');

  // Form States
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    workflowId: '',
    isActive: true,
  });

  // Hooks
  const { data: apiKeys = [], isLoading: isLoadingKeys } = useApiKeysList();

  // Infinite Scroll Hook
  const {
    data: workflowsData,
    isLoading: isLoadingWorkflows,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteDashboardWorkflows(10);

  const workflows = workflowsData?.pages.flatMap((page) => page.items) ?? [];

  // Observer for infinite scroll
  const observer = useRef<IntersectionObserver | null>(null);
  const lastWorkflowElementRef = useCallback(
    (node: HTMLButtonElement | null) => {
      if (isLoadingWorkflows || isFetchingNextPage) return;
      if (observer.current) observer.current.disconnect();

      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage) {
          fetchNextPage();
        }
      });

      if (node) observer.current.observe(node);
    },
    [isLoadingWorkflows, isFetchingNextPage, hasNextPage, fetchNextPage],
  );
  const { createApiKey, updateApiKey, deleteApiKey } = useApiKeyMutations();

  // Filtered Keys
  const filteredKeys = apiKeys.filter((key) =>
    key.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // --- Handlers ---

  const openCreateModal = () => {
    setFormData({ name: '', description: '', workflowId: '', isActive: true });
    setIsCreateModalOpen(true);
  };

  const openEditModal = (key: ApiKeyListDto) => {
    setSelectedKey(key);
    setFormData({
      name: key.name,
      description: key.description || '',
      workflowId: key.workflowId,
      isActive: key.isActive,
    });
    setIsEditModalOpen(true);
  };

  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.workflowId) return;

    try {
      const response = await createApiKey.mutateAsync({
        name: formData.name,
        description: formData.description,
        workflowId: formData.workflowId,
      });

      // Store the token to show it ONCE
      setCreatedKeyToken(response.apiKey);

      setIsCreateModalOpen(false);
      setIsSuccessModalOpen(true);
      toast.success('API Key creada correctamente');
    } catch (error) {
      toast.error('Error al crear la API Key');
    }
  };

  const handleUpdate = async () => {
    if (!selectedKey || !formData.name.trim()) return;

    try {
      await updateApiKey.mutateAsync({
        id: selectedKey.id,
        data: {
          name: formData.name,
          description: formData.description,
          isActive: formData.isActive,
        },
      });
      setIsEditModalOpen(false);
      setSelectedKey(null);
      toast.success('API Key actualizada');
    } catch (error) {
      toast.error('Error al actualizar la API Key');
    }
  };

  const handleDelete = async () => {
    if (!selectedKey) return;

    try {
      await deleteApiKey.mutateAsync(selectedKey.id);
      setIsDeleteModalOpen(false);
      setSelectedKey(null);
      toast.success('API Key eliminada correctamente');
    } catch (error) {
      toast.error('Error al eliminar la API Key');
    }
  };

  if (isLoadingKeys) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <LogoLoader />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white">API Keys</h1>
          <p className="mt-1 text-black/50 dark:text-white/50">
            Gestiona las llaves de acceso para ejecutar tus workflows externamente
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 self-start rounded-full bg-black px-6 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:self-auto dark:bg-white dark:text-black"
        >
          <Plus size={16} />
          Nueva Key
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30"
        />
        <input
          type="text"
          placeholder="Buscar API Keys..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-full border-none bg-black/5 py-2 pl-10 pr-4 text-sm text-black transition-all placeholder:text-black/30 hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-black/5 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30 dark:hover:bg-white/10 dark:focus:ring-white/5"
        />
      </div>

      {/* Keys List */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {filteredKeys.map((key, index) => (
            <motion.div
              key={key.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: index * 0.05 }}
              className={`group flex flex-col gap-4 rounded-xl border border-transparent bg-transparent p-4 transition-all duration-200 hover:border-black/5 hover:bg-white hover:shadow-sm md:flex-row md:items-start dark:hover:border-white/5 dark:hover:bg-[#141414] ${!key.isActive ? 'opacity-60' : ''}`}
            >
              <div
                className={`flex-shrink-0 rounded-lg p-2 ${key.isActive ? 'bg-black/5 text-black/60 dark:bg-white/5 dark:text-white/60' : 'bg-black/5 text-black/30 dark:bg-white/5 dark:text-white/30'}`}
              >
                <Key size={18} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-3">
                  <h3
                    className={`truncate text-base font-semibold ${key.isActive ? 'text-black dark:text-white' : 'text-black/50 line-through dark:text-white/50'}`}
                  >
                    {key.name}
                  </h3>

                  {/* Minimal Status Dot */}
                  <div className="flex items-center gap-1.5 rounded-full bg-black/5 px-2 py-0.5 dark:bg-white/5">
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${key.isActive ? 'bg-emerald-500' : 'bg-zinc-400'}`}
                    />
                    <span
                      className={`text-[10px] font-medium uppercase tracking-wide ${key.isActive ? 'text-emerald-600' : 'text-zinc-500'}`}
                    >
                      {key.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                </div>

                {key.description && (
                  <p className="mb-2 line-clamp-1 text-sm text-black/60 dark:text-white/60">
                    {key.description}
                  </p>
                )}

                <div className="mt-1 flex items-center gap-2 text-xs text-black/40 dark:text-white/40">
                  <Workflow size={12} />
                  <span className="truncate font-medium">
                    {workflows.find((w) => w.id === key.workflowId)?.name || 'Workflow desconocido'}
                  </span>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-1 self-start opacity-0 transition-opacity group-hover:opacity-100 md:mt-0 md:self-center">
                <button
                  onClick={() => openEditModal(key)}
                  className="rounded-full p-2 text-black/40 transition-colors hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
                  title="Editar"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => {
                    setSelectedKey(key);
                    setIsDeleteModalOpen(true);
                  }}
                  className="rounded-full p-2 text-black/40 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-white/40"
                  title="Eliminar"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredKeys.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-16 text-center"
          >
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5">
              <Key size={24} className="text-black/30 dark:text-white/30" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-black dark:text-white">
              No se encontraron API Keys
            </h3>
            <p className="text-black/50 dark:text-white/50">Crea una nueva llave para comenzar.</p>
          </motion.div>
        )}
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <Modal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            title="Nueva API Key"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-black/70 dark:text-white/70">
                  Nombre
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Producción Web"
                  className="w-full rounded-xl border border-transparent bg-black/5 px-4 py-2 text-black transition-colors focus:border-black/10 focus:outline-none dark:bg-white/5 dark:text-white dark:focus:border-white/10"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-black/70 dark:text-white/70">
                  Descripción (Opcional)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Para qué se usa esta llave..."
                  rows={2}
                  className="w-full resize-none rounded-xl border border-transparent bg-black/5 px-4 py-2 text-black transition-colors focus:border-black/10 focus:outline-none dark:bg-white/5 dark:text-white dark:focus:border-white/10"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-black/70 dark:text-white/70">
                  Workflow Asociado
                </label>
                <div className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
                  {isLoadingWorkflows ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2
                        className="animate-spin text-black/20 dark:text-white/20"
                        size={20}
                      />
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto overflow-x-hidden">
                      {workflows.map((wf, index) => {
                        const isLastElement = workflows.length === index + 1;
                        return (
                          <button
                            ref={isLastElement ? lastWorkflowElementRef : null}
                            key={wf.id}
                            onClick={() => setFormData({ ...formData, workflowId: wf.id })}
                            className={`flex w-full items-center border-b border-black/5 p-3 text-left transition-colors last:border-0 dark:border-white/5 ${
                              formData.workflowId === wf.id
                                ? 'bg-black/5 text-black dark:bg-white/5 dark:text-white'
                                : 'bg-white text-black/70 hover:bg-black/5 dark:bg-[#141414] dark:text-white/70 dark:hover:bg-white/5'
                            }`}
                          >
                            <div className="flex-1 truncate pr-2">
                              <div className="truncate text-sm font-medium">{wf.name}</div>
                            </div>
                            {formData.workflowId === wf.id && (
                              <Check size={16} className="shrink-0 text-black dark:text-white" />
                            )}
                          </button>
                        );
                      })}
                      {isFetchingNextPage && (
                        <div className="flex justify-center p-2">
                          <Loader2
                            className="animate-spin text-black/20 dark:text-white/20"
                            size={16}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1 rounded-xl bg-black/5 px-4 py-2 font-medium text-black transition-colors hover:bg-black/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreate}
                  disabled={createApiKey.isPending || !formData.name.trim() || !formData.workflowId}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-black px-4 py-2 font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
                >
                  {createApiKey.isPending ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    'Crear API Key'
                  )}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Success Modal (Show Token) */}
      <AnimatePresence>
        {isSuccessModalOpen && (
          <Modal
            isOpen={isSuccessModalOpen}
            onClose={() => {
              setIsSuccessModalOpen(false);
              setCreatedKeyToken('');
            }}
            title="API Key Creada"
          >
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl bg-emerald-500/10 p-4 text-emerald-700 dark:text-emerald-400">
                <Check className="mt-0.5 shrink-0" size={18} />
                <p className="text-sm">
                  Esta es la única vez que podrás ver la llave completa. Por favor cópiala y
                  guárdala en un lugar seguro.
                </p>
              </div>

              <div className="group/key relative">
                <div className="w-full break-all rounded-xl border border-black/10 bg-black/5 p-4 pr-12 font-mono text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white">
                  {createdKeyToken}
                </div>
                <CopyButton
                  text={createdKeyToken}
                  className="absolute right-2 top-2 rounded-lg border border-black/5 bg-white px-3 py-1.5 text-black shadow-sm transition-transform hover:scale-105 dark:border-white/5 dark:bg-black dark:text-white"
                />
              </div>

              <button
                onClick={() => {
                  setIsSuccessModalOpen(false);
                  setCreatedKeyToken('');
                }}
                className="w-full rounded-xl bg-black px-4 py-2 font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-black"
              >
                Entendido
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {isEditModalOpen && selectedKey && (
          <Modal
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            title="Editar API Key"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-black/70 dark:text-white/70">
                  Nombre
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-transparent bg-black/5 px-4 py-2 text-black transition-colors focus:border-black/10 focus:outline-none dark:bg-white/5 dark:text-white dark:focus:border-white/10"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-black/70 dark:text-white/70">
                  Descripción
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-transparent bg-black/5 px-4 py-2 text-black transition-colors focus:border-black/10 focus:outline-none dark:bg-white/5 dark:text-white dark:focus:border-white/10"
                />
              </div>

              <div className="py-2">
                <div className="flex items-center justify-between rounded-xl border border-black/10 p-3 dark:border-white/10">
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded-lg p-2 ${formData.isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-black/5 text-black/40 dark:bg-white/5 dark:text-white/40'}`}
                    >
                      <Power size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-black dark:text-white">Estado</p>
                      <p className="text-xs text-black/50 dark:text-white/50">
                        {formData.isActive
                          ? 'La llave está activa y funcionando'
                          : 'La llave está deshabilitada'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formData.isActive ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formData.isActive ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 rounded-xl bg-black/5 px-4 py-2 font-medium text-black transition-colors hover:bg-black/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={updateApiKey.isPending || !formData.name.trim()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-black px-4 py-2 font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
                >
                  {updateApiKey.isPending ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    'Guardar Cambios'
                  )}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <Modal
            isOpen={isDeleteModalOpen}
            onClose={() => setIsDeleteModalOpen(false)}
            title="Eliminar API Key"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-red-500/10 p-4 text-red-600 dark:text-red-400">
                <AlertTriangle size={24} />
                <p className="text-sm font-medium">
                  Esta acción es irreversible. La API Key dejará de funcionar inmediatamente.
                </p>
              </div>

              <p className="text-center text-sm text-black/60 dark:text-white/60">
                ¿Estás seguro de que deseas eliminar <strong>{selectedKey?.name}</strong>?
              </p>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 rounded-xl bg-black/5 px-4 py-2 font-medium text-black transition-colors hover:bg-black/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteApiKey.isPending}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2 font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                >
                  {deleteApiKey.isPending ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    'Sí, eliminar'
                  )}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
