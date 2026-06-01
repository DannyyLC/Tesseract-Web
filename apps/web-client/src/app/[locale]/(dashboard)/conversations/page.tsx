'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'next/navigation';
import { useRouter, usePathname } from '@/i18n/routing';
import { MessageSquare, Search, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import {
  useConversationsDashboard,
  useConversationsStats,
} from '@/hooks/messaging/use-conversations';
import { useInfiniteDashboardWorkflows } from '@/hooks/automation/use-workflows';
import { useInfiniteUsersDashboard } from '@/hooks/identity/use-users';
import { LogoLoader } from '@/components/ui/logo-loader';
import DashboardConversationItem from './_components/dashboard-conversation-item';
import FilterDropdown from './_components/filter-dropdown';
import PermissionGuard from '@/components/auth/permission-guard';

const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num?.toString() || '0';
};

export default function ConversationsPage() {
  const t = useTranslations('Conversations');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read state from URL
  const cursor = searchParams.get('cursor') || undefined;
  const pageAction = searchParams.get('action') as 'next' | 'prev' | undefined;
  const selectedStatus = searchParams.get('status') || undefined;
  const selectedIntervened = searchParams.get('isIntervened') || undefined;
  const selectedWorkflow = searchParams.get('workflowId') || undefined;
  const selectedUser = searchParams.get('userId') || undefined;

  const pageSize = 10;

  // Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [debouncedModalSearch, setDebouncedModalSearch] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedModalSearch(modalSearchQuery);
    }, 500);
    return () => clearTimeout(handler);
  }, [modalSearchQuery]);

  // Modal Search Hook
  const {
    data: modalWorkflowsData,
    fetchNextPage: fetchNextModalWorkflows,
    hasNextPage: hasNextModalWorkflows,
    isFetchingNextPage: isFetchingNextModalWorkflows,
    isLoading: isLoadingModalWorkflows,
  } = useInfiniteDashboardWorkflows(10, debouncedModalSearch);

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
    [isFetchingNextModalWorkflows, hasNextModalWorkflows, fetchNextModalWorkflows],
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
    status: selectedStatus,
    isIntervened:
      selectedIntervened === 'true' ? true : selectedIntervened === 'false' ? false : undefined,
    workflowId: selectedWorkflow,
    userId: selectedUser,
    prioritizeHitl: true,
  });

  const statusOptions = [
    { label: t('statusActive'), value: 'ACTIVE' },
    { label: t('statusClosed'), value: 'CLOSED' },
  ];

  const interventionOptions = [
    { label: t('interventionYes'), value: 'true' },
    { label: t('interventionNo'), value: 'false' },
  ];

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

  const handleStatusChange = (status: string) => {
    updateUrl({ status: status || null, cursor: null, action: null });
  };

  const handleIntervenedChange = (value: string) => {
    updateUrl({ isIntervened: value || null, cursor: null, action: null });
  };

  return (
    <PermissionGuard permissions="conversations:read" redirect={true} fallbackRoute="/dashboard">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{t('heading')}</h1>
            <p className="mt-1 text-text-secondary">{t('description')}</p>
          </div>

          <PermissionGuard permissions="conversations:update">
            <button
              onClick={() => {
                if (selectedWorkflow) {
                  router.push(`/conversations/new?workflowId=${selectedWorkflow}`);
                } else {
                  // If no workflow is selected in filter, open modal
                  setIsCreateModalOpen(true);
                  setModalSearchQuery('');
                  setDebouncedModalSearch('');
                }
              }}
              className="flex items-center gap-2 rounded-full bg-accent px-6 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MessageSquare size={16} />
              {t('newButton')}
            </button>
          </PermissionGuard>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid grid-cols-1 gap-8 px-2 md:grid-cols-3">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col justify-between"
          >
            <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              {t('activeConversations')}
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
                {stats?.activeConversations ?? 0}
              </p>
              <span className="text-xs font-medium text-success-500">{t('inProgress')}</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex flex-col justify-between border-border md:border-l md:pl-8"
          >
            <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              {t('messagesMonth')}
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
                {formatNumber(stats?.totalMessagesMonth ?? 0)}
              </p>
              <span className="text-xs font-medium text-text-tertiary">{t('monthlyTotal')}</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col justify-between border-border md:border-l md:pl-8"
          >
            <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              {t('historicTotal')}
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
                {formatNumber(stats?.totalConversations ?? 0)}
              </p>
              <span className="text-xs font-medium text-text-tertiary">
                {t('conversationsBadge')}
              </span>
            </div>
          </motion.div>
        </div>

        {/* Filters */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
            <FilterDropdown
              label={t('statusLabel')}
              options={statusOptions}
              value={selectedStatus}
              onChange={handleStatusChange}
              placeholder={t('allStatuses')}
            />

            <FilterDropdown
              label={t('interventionLabel')}
              options={interventionOptions}
              value={selectedIntervened}
              onChange={handleIntervenedChange}
              placeholder={t('allInterventions')}
            />

            <FilterDropdown
              label={t('workflowLabel')}
              options={workflows}
              value={selectedWorkflow}
              onChange={handleWorkflowChange}
              placeholder={t('allWorkflows')}
              onReachEnd={() => hasNextWorkflows && fetchNextWorkflows()}
              hasMore={hasNextWorkflows}
              isLoadingMore={isFetchingNextWorkflows}
            />

            <FilterDropdown
              label={t('userLabel')}
              options={users}
              value={selectedUser}
              onChange={handleUserChange}
              placeholder={t('allUsers')}
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
            <div className="bg-surface/50 absolute inset-0 z-10 flex items-start justify-center rounded-2xl pt-10 backdrop-blur-[1px]">
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
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-secondary">
                <MessageSquare size={24} className="text-text-tertiary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-text-primary">
                {t('noConversations')}
              </h3>
              <p className="text-text-secondary">{t('noConversationsDesc')}</p>
            </motion.div>
          )}
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <button
            onClick={handlePrevPage}
            disabled={!prevCursor}
            className="px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-30"
          >
            {t('previous')}
          </button>
          <span className="text-xs text-text-tertiary">
            {t('showingItems', { count: conversations.length })}
          </span>
          <button
            onClick={handleNextPage}
            disabled={!nextPageAvailable}
            className="px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-30"
          >
            {t('next')}
          </button>
        </div>

        {/* Workflow Selection Modal */}
        <AnimatePresence>
          {isCreateModalOpen && (
            <Modal
              isOpen={isCreateModalOpen}
              onClose={() => setIsCreateModalOpen(false)}
              title={t('newModalTitle')}
            >
              <div className="space-y-4">
                <p className="text-sm text-text-secondary">{t('newModalDesc')}</p>

                {/* Search */}
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                  />
                  <input
                    type="text"
                    placeholder={t('searchWorkflowPlaceholder')}
                    value={modalSearchQuery}
                    onChange={(e) => setModalSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-transparent bg-surface-secondary py-2 pl-9 pr-4 text-sm text-text-primary transition-colors focus:border-border-hover focus:outline-none"
                  />
                </div>

                {/* List */}
                <div className="overflow-hidden rounded-xl border border-border bg-surface-secondary">
                  {isLoadingModalWorkflows ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="animate-spin text-text-tertiary" size={20} />
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
                              className="flex w-full items-center border-b border-border bg-surface p-3 text-left text-text-secondary transition-colors last:border-0 hover:bg-surface-secondary"
                            >
                              <div className="flex-1 truncate pr-2">
                                <div className="truncate text-sm font-medium text-text-primary">
                                  {wf.name}
                                </div>
                                {wf.description && (
                                  <div className="truncate text-xs text-text-tertiary">
                                    {wf.description}
                                  </div>
                                )}
                              </div>
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-secondary">
                                <MessageSquare size={12} className="text-text-tertiary" />
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="p-4 text-center text-sm text-text-tertiary">
                          {t('noWorkflowsInModal')}
                        </div>
                      )}
                      {isFetchingNextModalWorkflows && (
                        <div className="flex justify-center p-2">
                          <Loader2 className="animate-spin text-text-tertiary" size={16} />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="w-full bg-transparent px-4 py-2 text-sm font-medium text-text-tertiary transition-colors hover:text-text-primary"
                >
                  {t('cancelButton')}
                </button>
              </div>
            </Modal>
          )}
        </AnimatePresence>
      </div>
    </PermissionGuard>
  );
}
