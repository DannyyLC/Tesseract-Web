'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { MessageSquare, Search, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { useConversationsDashboard, useConversationsStats } from '@/hooks/useConversations';
import { useInfiniteDashboardWorkflows } from '@/hooks/useWorkflows';
import { useInfiniteUsersDashboard } from '@/hooks/useUsers';
import { LogoLoader } from '@/components/ui/logo-loader';
import DashboardConversationItem from './_components/dashboard-conversation-item';
import FilterDropdown from './_components/filter-dropdown';

const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num?.toString() || '0';
};

export default function ConversationsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read state from URL
  const cursor = searchParams.get('cursor') || undefined;
  const pageAction = searchParams.get('action') as 'next' | 'prev' | undefined;
  const selectedWorkflow = searchParams.get('workflowId') || undefined;
  const selectedUser = searchParams.get('userId') || undefined;

  const pageSize = 10;

  // Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [modalSearchQuery, setModalSearchQuery] = useState('');

  // Modal Search Hook
  const {
    data: modalWorkflowsData,
    fetchNextPage: fetchNextModalWorkflows,
    hasNextPage: hasNextModalWorkflows,
    isFetchingNextPage: isFetchingNextModalWorkflows,
    isLoading: isLoadingModalWorkflows,
  } = useInfiniteDashboardWorkflows(10, modalSearchQuery);

  const modalWorkflows = modalWorkflowsData?.pages.flatMap((page) => page.items) ?? [];

  // Modal Infinite Scroll Observer
  const modalObserver = useRef<IntersectionObserver | null>(null);
  const lastModalWorkflowRef = useCallback(
    (node: HTMLButtonElement | null) => {
      if (isFetchingNextModalWorkflows) return;
      if (modalObserver.current) modalObserver.current.disconnect();

      modalObserver.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextModalWorkflows) {
          fetchNextModalWorkflows();
        }
      });

      if (node) modalObserver.current.observe(node);
    },
    [isFetchingNextModalWorkflows, hasNextModalWorkflows, fetchNextModalWorkflows]
  );

  // Helper to update URL
  const updateUrl = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Cargar datos del Dashboard (Conversaciones)
  const { data: conversationsData, isLoading } = useConversationsDashboard({
    cursor,
    pageSize,
    action: pageAction,
    workflowId: selectedWorkflow,
    userId: selectedUser,
  });

  // Cargar listas para filtros
  // Workflows
  const {
    data: workflowsData,
    fetchNextPage: fetchNextWorkflows,
    hasNextPage: hasNextWorkflows,
    isFetchingNextPage: isFetchingNextWorkflows,
  } = useInfiniteDashboardWorkflows(10);

  const workflows = (workflowsData?.pages.flatMap((page) => page.items) ?? []).map((wf) => ({
    label: wf.name,
    value: wf.id,
  }));

  // Users
  const {
    data: usersData,
    fetchNextPage: fetchNextUsers,
    hasNextPage: hasNextUsers,
    isFetchingNextPage: isFetchingNextUsers,
  } = useInfiniteUsersDashboard({ pageSize: 10 });

  const users = (usersData?.pages.flatMap((page) => page.items) ?? []).map((user) => ({
    label: user.name || user.email,
    value: user.id,
  }));

  const conversations = conversationsData?.items ?? [];
  const nextPageAvailable = conversationsData?.nextPageAvailable ?? false;
  const nextCursor = conversationsData?.nextCursor;
  const prevCursor = conversationsData?.prevCursor;

  // Cargar Estadísticas
  const { data: stats } = useConversationsStats();

  // Handlers
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

  const handleWorkflowChange = (workflowId: string) => {
    updateUrl({ workflowId: workflowId || null, cursor: null, action: null });
  };

  const handleUserChange = (userId: string) => {
    updateUrl({ userId: userId || null, cursor: null, action: null });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white">Conversaciones</h1>
          <p className="mt-1 text-black/50 dark:text-white/50">
            Gestiona y monitorea las interacciones con tus usuarios
          </p>
        </div>

        <button
          onClick={() => {
            if (selectedWorkflow) {
              router.push(`/conversations/new?workflowId=${selectedWorkflow}`);
            } else {
              // If no workflow is selected in filter, open modal
              setIsCreateModalOpen(true);
              setModalSearchQuery('');
            }
          }}
          className="flex items-center gap-2 rounded-full bg-black px-6 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
        >
          <MessageSquare size={16} />
          Nueva Conversación
        </button>
      </div>

      {/* Stats Cards */}
      <div className="mb-8 grid grid-cols-1 gap-8 px-2 md:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col justify-between"
        >
          <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">
            Conversaciones Activas
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <p className="font-geist-mono text-4xl font-light tracking-tight text-black dark:text-white">
              {stats?.activeConversations ?? 0}
            </p>
            <span className="text-xs font-medium text-emerald-500">En curso</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex flex-col justify-between border-black/5 md:border-l md:pl-8 dark:border-white/5"
        >
          <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">
            Mensajes (Mes)
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <p className="font-geist-mono text-4xl font-light tracking-tight text-black dark:text-white">
              {formatNumber(stats?.totalMessagesMonth ?? 0)}
            </p>
            <span className="text-xs font-medium text-black/30 dark:text-white/30">
              Total mensual
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col justify-between border-black/5 md:border-l md:pl-8 dark:border-white/5"
        >
          <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">
            Total Histórico
          </span>
          <div className="mt-1 flex items-baseline gap-1">
            <p className="font-geist-mono text-4xl font-light tracking-tight text-black dark:text-white">
              {formatNumber(stats?.totalConversations ?? 0)}
            </p>
            <span className="text-xs font-medium text-black/30 dark:text-white/30">
              Conversaciones
            </span>
          </div>
        </motion.div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Workflows Filter */}
        <div className="flex-1">
          <FilterDropdown
            label="Workflow"
            options={workflows}
            value={selectedWorkflow}
            onChange={handleWorkflowChange}
            placeholder="Todos los Workflows"
            onReachEnd={() => hasNextWorkflows && fetchNextWorkflows()}
            hasMore={hasNextWorkflows}
            isLoadingMore={isFetchingNextWorkflows}
          />
        </div>

        {/* Users Filter */}
        <div className="flex-1">
          <FilterDropdown
            label="Usuario"
            options={users}
            value={selectedUser}
            onChange={handleUserChange}
            placeholder="Todos los Usuarios"
            onReachEnd={() => hasNextUsers && fetchNextUsers()}
            hasMore={hasNextUsers}
            isLoadingMore={isFetchingNextUsers}
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="relative min-h-[200px] space-y-3">
        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-start justify-center rounded-2xl bg-white/50 pt-10 backdrop-blur-[1px] dark:bg-black/50">
            <LogoLoader />
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {conversations.map((conversation) => (
            <DashboardConversationItem key={conversation.id} conversation={conversation} />
          ))}
        </AnimatePresence>

        {/* Empty State */}
        {conversations.length === 0 && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-16 text-center"
          >
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5">
              <MessageSquare size={24} className="text-black/30 dark:text-white/30" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-black dark:text-white">
              No se encontraron conversaciones
            </h3>
            <p className="text-black/50 dark:text-white/50">
              Aún no hay conversaciones registradas o activa un workflow para comenzar.
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
          Showing {conversations.length} items
        </span>
        <button
          onClick={handleNextPage}
          disabled={!nextPageAvailable}
          className="px-4 py-2 text-sm font-medium text-black/60 transition-colors hover:text-black disabled:opacity-30 disabled:hover:text-black/60 dark:text-white/60 dark:hover:text-white dark:disabled:hover:text-white/60"
        >
          Siguiente
        </button>
      </div>

      {/* Workflow Selection Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <Modal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            title="Nueva Conversación"
          >
            <div className="space-y-4">
              <p className="text-sm text-black/60 dark:text-white/60">
                Selecciona un Workflow para iniciar la conversación
              </p>

              {/* Search */}
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30"
                />
                <input
                  type="text"
                  placeholder="Buscar workflow..."
                  value={modalSearchQuery}
                  onChange={(e) => setModalSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-transparent bg-black/5 py-2 pl-9 pr-4 text-sm text-black transition-colors focus:border-black/10 focus:outline-none dark:bg-white/5 dark:text-white dark:focus:border-white/10"
                />
              </div>

              {/* List */}
              <div className="overflow-hidden rounded-xl border border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5">
                {isLoadingModalWorkflows ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="animate-spin text-black/20 dark:text-white/20" size={20} />
                  </div>
                ) : (
                  <div className="max-h-60 overflow-y-auto overflow-x-hidden">
                    {modalWorkflows.length > 0 ? (
                      modalWorkflows.map((wf, index) => {
                        const isLast = index === modalWorkflows.length - 1;
                        return (
                          <button
                            ref={isLast ? lastModalWorkflowRef : null}
                            key={wf.id}
                            onClick={() => router.push(`/conversations/new?workflowId=${wf.id}`)}
                            className="flex w-full items-center border-b border-black/5 bg-white p-3 text-left text-black/70 transition-colors last:border-0 hover:bg-black/5 dark:border-white/5 dark:bg-[#141414] dark:text-white/70 dark:hover:bg-white/5"
                          >
                            <div className="flex-1 truncate pr-2">
                              <div className="truncate text-sm font-medium text-black dark:text-white">
                                {wf.name}
                              </div>
                              {wf.description && (
                                <div className="truncate text-xs text-black/40 dark:text-white/40">
                                  {wf.description}
                                </div>
                              )}
                            </div>
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-black/5 dark:bg-white/5">
                              <MessageSquare
                                size={12}
                                className="text-black/30 dark:text-white/30"
                              />
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-4 text-center text-sm text-black/40 dark:text-white/40">
                        No se encontraron workflows
                      </div>
                    )}
                    {isFetchingNextModalWorkflows && (
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

              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="w-full bg-transparent px-4 py-2 text-sm font-medium text-black/40 transition-colors hover:text-black dark:text-white/40 dark:hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
