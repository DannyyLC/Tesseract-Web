'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { useRouter, usePathname } from '@/i18n/routing';
import { Search, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDashboardWorkflows, useWorkflowStats } from '@/hooks/automation/use-workflows';
import { useSupportMutations } from '@/hooks/platform/use-support';
import { WorkflowCategory } from '@tesseract/types';
import { LogoLoader } from '@/components/ui/logo-loader';
import { Modal } from '@/components/ui/modal';
import DashboardWorkflowItem from './_components/dashboard-workflow-item';
import FilterDropdown from './_components/filter-dropdown';
import PermissionGuard from '@/components/auth/permission-guard';

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
  const t = useTranslations('Workflows');
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
    [searchParams, pathname, router],
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
    selectedCategory,
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
        subject: t('newWorkflowSubject'),
        userMsg: t('newWorkflowUserMsg'),
      });
      toast.success(t('requestSentToast'));
      setIsCreateModalOpen(false);
      router.push('/support?reason=nuevo-workflow');
    } catch (error) {
      toast.error(t('rateLimitError'));
    }
  };

  const statusOptions = [
    { value: 'all', label: t('statusAll') },
    { value: 'active', label: t('filterActive') },
    { value: 'inactive', label: t('filterInactive') },
  ];

  const categoryOptions = [
    { value: 'LIGHT', label: `Light (${getCategoryCount(WorkflowCategory.LIGHT)})` },
    { value: 'STANDARD', label: `Standard (${getCategoryCount(WorkflowCategory.STANDARD)})` },
    { value: 'ADVANCED', label: `Advanced (${getCategoryCount(WorkflowCategory.ADVANCED)})` },
  ];

  return (
    <PermissionGuard permissions="workflows:read" redirect={true} fallbackRoute="/dashboard">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{t('heading')}</h1>
            <p className="mt-1 text-text-secondary">{t('description')}</p>
          </div>

          <PermissionGuard permissions="workflows:create">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 rounded-full bg-accent px-6 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={16} />
              {t('newButton')}
            </button>
          </PermissionGuard>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid grid-cols-2 gap-8 px-2 lg:grid-cols-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col justify-between"
          >
            <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              {t('activeWorkflows')}
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
                {globalStats?.activeWorkflows ?? 0}
              </p>
              <span className="px-2 py-0.5 text-xs font-medium text-[var(--success-text-adaptive)]">
                {t('totalActive')}
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex flex-col justify-between border-[var(--border-subtle)] lg:border-l lg:pl-8"
          >
            <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              {t('executionsMonth')}
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
                {formatNumber(globalStats?.totalExecutionsMonth ?? 0)}
              </p>
              <span className="px-2 py-0.5 text-xs font-medium text-info">{t('last30Days')}</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col justify-between border-[var(--border-subtle)] lg:border-l lg:pl-8"
          >
            <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              {t('creditsMonth')}
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
                {formatNumber(globalStats?.creditsConsumedMonth ?? 0)}
              </p>
              <span className="text-xs font-medium text-text-tertiary">
                {t('monthlyConsumption')}
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="flex flex-col justify-between border-[var(--border-subtle)] lg:border-l lg:pl-8"
          >
            <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              {t('workflowsByCategory')}
            </span>
            <div className="flex flex-col justify-end gap-1">
              {[WorkflowCategory.LIGHT, WorkflowCategory.STANDARD, WorkflowCategory.ADVANCED].map(
                (cat) => (
                  <div
                    key={cat}
                    className="flex items-center justify-between text-[11px] text-text-tertiary"
                  >
                    <span className="uppercase tracking-wide">{toTitleCase(cat)}</span>
                    <span className="ml-2 font-mono text-text-primary">
                      {getCategoryCount(cat)}
                    </span>
                  </div>
                ),
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
              className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full rounded-full border-none bg-[var(--surface-tint)] py-2 pl-10 pr-4 text-sm text-text-primary transition-all placeholder:text-input-placeholder hover:bg-[var(--surface-tint-md)] focus:outline-none focus:ring-2 focus:ring-[var(--border-subtle)]"
            />
          </div>

          {/* Filters Row */}
          <div className="flex min-w-[300px] gap-2">
            <FilterDropdown
              label={t('statusLabel')}
              options={statusOptions}
              value={filterStatus === 'all' ? '' : filterStatus}
              onChange={handleFilterChange}
              placeholder={t('statusAll')}
              className="flex-1"
            />

            <FilterDropdown
              label={t('categoryLabel')}
              options={categoryOptions}
              value={selectedCategory || ''}
              onChange={handleCategoryChange}
              placeholder={t('categoryAll')}
              className="flex-1"
            />
          </div>
        </div>

        {/* Workflows List */}
        <div className="relative min-h-[200px] space-y-3">
          {/* Loading Overlay */}
          {isLoading && (
            <div className="bg-surface/50 absolute inset-0 z-10 flex items-start justify-center rounded-2xl pt-10 backdrop-blur-[1px]">
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
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-secondary">
                <Search size={24} className="text-text-tertiary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-text-primary">{t('noWorkflows')}</h3>
              <p className="text-text-secondary">{t('noWorkflowsDesc')}</p>
            </motion.div>
          )}
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-4">
          <button
            onClick={handlePrevPage}
            disabled={!prevCursor}
            className="px-4 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-secondary"
          >
            {t('previous')}
          </button>
          <span className="text-xs text-text-tertiary">
            {t('showingItems', { count: workflows.length })}
          </span>
          <button
            onClick={handleNextPage}
            disabled={!nextPageAvailable}
            className="px-4 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-secondary"
          >
            {t('next')}
          </button>
        </div>

        {/* New Workflow Modal */}
        <AnimatePresence>
          {isCreateModalOpen && (
            <Modal
              isOpen={isCreateModalOpen}
              onClose={() => setIsCreateModalOpen(false)}
              title={t('newModalTitle')}
            >
              <div className="space-y-6">
                <div className="space-y-2">
                  <p className="text-sm text-text-secondary">{t('newModalText1')}</p>
                  <p className="text-sm text-text-secondary">{t('newModalText2')}</p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setIsCreateModalOpen(false)}
                    className="flex-1 rounded-xl bg-[var(--surface-tint)] px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-[var(--surface-tint-md)]"
                  >
                    {t('cancelButton')}
                  </button>
                  <button
                    onClick={handleRequestWorkflow}
                    disabled={requestServiceInfo.isPending}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {requestServiceInfo.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('requestMeetingButton')}
                  </button>
                </div>
              </div>
            </Modal>
          )}
        </AnimatePresence>
      </div>
    </PermissionGuard>
  );
}
