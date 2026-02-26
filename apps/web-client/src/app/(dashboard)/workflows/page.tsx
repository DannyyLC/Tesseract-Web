'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Search, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDashboardWorkflows, useWorkflowStats } from '@/hooks/useWorkflows';
import { useSupportMutations } from '@/hooks/useSupport';
import { WorkflowCategory } from '@tesseract/types';
import { LogoLoader } from '@/components/ui/logo-loader';
import { Modal } from '@/components/ui/modal';
import DashboardWorkflowItem from './_components/dashboard-workflow-item';
import FilterDropdown from './_components/filter-dropdown';

const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num?.toString() || '0';
};

type FilterStatus = 'all' | 'active' | 'inactive';

const toTitleCase = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

export default function WorkflowsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read state from URL
  const cursor = searchParams.get('cursor') || undefined;
  const pageAction = searchParams.get('action') as 'next' | 'prev' | undefined;
  const searchQuery = searchParams.get('search') || '';
  const filterStatus = (searchParams.get('status') as FilterStatus) || 'all';
  const selectedCategory = (searchParams.get('category') as WorkflowCategory) || undefined;

  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const pageSize = 10;

  // Sync debounced search with input (local input state needed for typing)
  const [localSearch, setLocalSearch] = useState(searchQuery);

  const { requestServiceInfo } = useSupportMutations();

  // Helper to update URL
  const updateUrl = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, pathname, router]
  );

  // Debounce Search Effect
  useEffect(() => {
    const handler = setTimeout(() => {
      if (localSearch !== searchQuery) {
        updateUrl({ search: localSearch, cursor: null, action: null }); // Reset page on search
      }
      setDebouncedSearch(localSearch);
    }, 500);

    return () => clearTimeout(handler);
  }, [localSearch, searchQuery, updateUrl]);

  // 2. Mapear filtros actuales a argumentos del API
  const apiIsActive =
    filterStatus === 'inactive' ? false : filterStatus === 'active' ? true : undefined;

  // 3. Cargar datos del Dashboard (Paginado + Filtros)
  const { data: workflowsData, isLoading } = useDashboardWorkflows(
    cursor,
    pageSize,
    pageAction,
    debouncedSearch || undefined,
    apiIsActive,
    selectedCategory
  );

  const workflows = workflowsData?.items ?? [];
  const nextPageAvailable = workflowsData?.nextPageAvailable ?? false;
  const nextCursor = workflowsData?.nextCursor;
  const prevCursor = workflowsData?.prevCursor;

  // 4. Cargar Estadísticas Globales (Async)
  const { data: globalStats } = useWorkflowStats();

  // Helper para obtener conteo por categoría segura
  const getCategoryCount = (category: WorkflowCategory) => {
    return globalStats?.byCategory?.[category] ?? 0;
  };

  // Handler para paginación
  const handleNextPage = () => {
    if (nextPageAvailable && nextCursor) {
      updateUrl({ cursor: nextCursor, action: 'next' });
    }
  };

  const handlePrevPage = () => {
    if (prevCursor) {
      updateUrl({ cursor: prevCursor, action: 'prev' });
    }
  };

  const handleFilterChange = (status: string) => {
    const statusValue = status === '' ? 'all' : status;
    updateUrl({ status: statusValue === 'all' ? null : statusValue, cursor: null, action: null });
  };

  const handleCategoryChange = (category: string) => {
    updateUrl({ category: category || null, cursor: null, action: null });
  };

  const handleRequestWorkflow = async () => {
    try {
      await requestServiceInfo.mutateAsync({
        subject: 'Implementación de nuevo Workflow',
        userMsg: 'El usuario solicita una reunión para definir requerimientos de un nuevo workflow.',
      });
      toast.success('Solicitud enviada. Por favor, selecciona un horario para nuestra reunión.');
      setIsCreateModalOpen(false);
      router.push('/support?reason=nuevo-workflow');
    } catch (error) {
      toast.error('Espera un poco e intenta de nuevo. Tenemos un límite de envío de mensajes.');
    }
  };

  const statusOptions = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Activos' },
    { value: 'inactive', label: 'Inactivos' },
  ];

  const categoryOptions = [
    { value: 'LIGHT', label: `Light (${getCategoryCount(WorkflowCategory.LIGHT)})` },
    { value: 'STANDARD', label: `Standard (${getCategoryCount(WorkflowCategory.STANDARD)})` },
    { value: 'ADVANCED', label: `Advanced (${getCategoryCount(WorkflowCategory.ADVANCED)})` },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white">Mis Workflows</h1>
          <p className="mt-1 text-black/50 dark:text-white/50">
            Gestiona y monitorea tus automatizaciones
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 rounded-full bg-black px-6 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
        >
          <Plus size={16} />
          Nuevo Workflow
        </button>
      </div>

      {/* Stats Cards */}
      <div className="mb-8 grid grid-cols-2 gap-8 px-2 lg:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col justify-between"
        >
          <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">
            Workflows Activos
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <p className="font-geist-mono text-4xl font-light tracking-tight text-black dark:text-white">
              {globalStats?.activeWorkflows ?? 0}
            </p>
            <span className="px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-500">
              Total activos
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex flex-col justify-between border-black/5 lg:border-l lg:pl-8 dark:border-white/5"
        >
          <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">
            Ejecuciones (Mes)
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <p className="font-geist-mono text-4xl font-light tracking-tight text-black dark:text-white">
              {formatNumber(globalStats?.totalExecutionsMonth ?? 0)}
            </p>
            <span className="px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-500">
              Últimos 30 días
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col justify-between border-black/5 lg:border-l lg:pl-8 dark:border-white/5"
        >
          <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">
            Créditos (Mes)
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <p className="font-geist-mono text-4xl font-light tracking-tight text-black dark:text-white">
              {formatNumber(globalStats?.creditsConsumedMonth ?? 0)}
            </p>
            <span className="text-xs font-medium text-black/30 dark:text-white/30">
              Consumo mensual
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="flex flex-col justify-between border-black/5 lg:border-l lg:pl-8 dark:border-white/5"
        >
          <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">
            Workflows por Categoría
          </span>
          <div className="flex flex-col justify-end gap-1">
            {[WorkflowCategory.LIGHT, WorkflowCategory.STANDARD, WorkflowCategory.ADVANCED].map(
              (cat) => (
                <div
                  key={cat}
                  className="flex items-center justify-between text-[11px] text-black/40 dark:text-white/40"
                >
                  <span className="uppercase tracking-wide">{toTitleCase(cat)}</span>
                  <span className="ml-2 font-mono text-black dark:text-white">
                    {getCategoryCount(cat)}
                  </span>
                </div>
              )
            )}
          </div>
        </motion.div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Search */}
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30"
          />
          <input
            type="text"
            placeholder="Buscar workflows..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="w-full rounded-full border-none bg-black/5 py-2 pl-10 pr-4 text-sm text-black transition-all placeholder:text-black/30 hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-black/5 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30 dark:hover:bg-white/10 dark:focus:ring-white/5"
          />
        </div>

        {/* Filters Row */}
        <div className="flex min-w-[300px] gap-2">
          <FilterDropdown
            label="Estado"
            options={statusOptions}
            value={filterStatus === 'all' ? '' : filterStatus}
            onChange={handleFilterChange}
            placeholder="Todos"
            className="flex-1"
          />

          <FilterDropdown
            label="Categoría"
            options={categoryOptions}
            value={selectedCategory || ''}
            onChange={handleCategoryChange}
            placeholder="Todas"
            className="flex-1"
          />
        </div>
      </div>

      {/* Workflows List */}
      <div className="relative min-h-[200px] space-y-3">
        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-start justify-center rounded-2xl bg-white/50 pt-10 backdrop-blur-[1px] dark:bg-black/50">
            <LogoLoader />
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {workflows.map((workflow, index) => {
            return <DashboardWorkflowItem key={workflow.id} workflow={workflow} />;
          })}
        </AnimatePresence>

        {/* Empty State */}
        {workflows.length === 0 && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-16 text-center"
          >
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5">
              <Search size={24} className="text-black/30 dark:text-white/30" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-black dark:text-white">
              No se encontraron workflows
            </h3>
            <p className="text-black/50 dark:text-white/50">
              No hay workflows que coincidan con tus filtros.
            </p>
          </motion.div>
        )}
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between border-t border-black/5 pt-4 dark:border-white/5">
        <button
          onClick={handlePrevPage}
          disabled={!prevCursor}
          className="px-4 py-2 text-sm font-medium text-black/60 transition-colors hover:text-black disabled:opacity-30 disabled:hover:text-black/60 dark:text-white/60 dark:hover:text-white dark:disabled:hover:text-white/60"
        >
          Anterior
        </button>
        <span className="text-xs text-black/30 dark:text-white/30">
          Showing {workflows.length} items
        </span>
        <button
          onClick={handleNextPage}
          disabled={!nextPageAvailable}
          className="px-4 py-2 text-sm font-medium text-black/60 transition-colors hover:text-black disabled:opacity-30 disabled:hover:text-black/60 dark:text-white/60 dark:hover:text-white dark:disabled:hover:text-white/60"
        >
          Siguiente
        </button>
      </div>

      {/* New Workflow Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <Modal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            title="Nuevo Workflow"
          >
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-sm text-black/60 dark:text-white/60">
                  Para crear un nuevo workflow, necesitamos entender tus requerimientos específicos.
                </p>
                <p className="text-sm text-black/60 dark:text-white/60">
                  Al confirmar, enviaremos una solicitud a nuestro equipo para agendar una reunión y 
                  definir los detalles de tu nueva automatización.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1 rounded-xl bg-black/5 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRequestWorkflow}
                  disabled={requestServiceInfo.isPending}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black"
                >
                  {requestServiceInfo.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Solicitar Reunión
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
