'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence } from 'framer-motion';
import { Loader2, Plus } from 'lucide-react';
import { ApiKeyListDto, DEFAULT_PAGE_SIZE } from '@tesseract/types';
import { useApiKeys } from '@/hooks/identity/use-api-key';
import PermissionGuard from '@/components/auth/permission-guard';
import { CursorPager } from '@/components/ui/cursor-pager';
import {
  ApiKeyCreatedModal,
  ApiKeyRow,
  CreateApiKeyModal,
  DeleteApiKeyModal,
  EditApiKeyModal,
} from '@/components/api-keys';


/**
 * API Keys enlazadas a un workflow. Se crean desde aquí ya enlazadas, que es el
 * caso normal: en el schema una key no puede existir sin workflow.
 */
export default function WorkflowApiKeysSection({ workflowId }: { workflowId: string }) {
  const t = useTranslations('ApiKeys');

  const [cursor, setCursor] = useState<string | null>(null);
  const [action, setAction] = useState<'next' | 'prev' | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [keyToEdit, setKeyToEdit] = useState<ApiKeyListDto | null>(null);
  const [keyToDelete, setKeyToDelete] = useState<ApiKeyListDto | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const { data, isLoading } = useApiKeys({ workflowId, cursor, action, pageSize: DEFAULT_PAGE_SIZE });
  const apiKeys = data?.items ?? [];

  return (
    <div className="mb-8 rounded-2xl border border-border bg-[var(--surface-subtle)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="ml-1 text-sm font-semibold text-text-primary">{t('sectionTitle')}</h3>
        <PermissionGuard permissions="api_keys:create">
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-text-primary transition-all hover:bg-[var(--surface-tint)] active:scale-95"
          >
            <Plus size={14} />
            {t('newButton')}
          </button>
        </PermissionGuard>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <div className="flex min-h-28 items-center justify-center">
            <Loader2 size={20} className="animate-spin text-text-secondary" />
          </div>
        ) : apiKeys.length > 0 ? (
          <>
            <AnimatePresence mode="popLayout">
              {apiKeys.map((key, index) => (
                <ApiKeyRow
                  key={key.id}
                  apiKey={key}
                  index={index}
                  showWorkflow={false}
                  onEdit={setKeyToEdit}
                  onDelete={setKeyToDelete}
                />
              ))}
            </AnimatePresence>

            <CursorPager
              prevCursor={data?.prevCursor ?? null}
              nextCursor={data?.nextCursor ?? null}
              nextPageAvailable={data?.nextPageAvailable ?? false}
              prevLabel={t('prev')}
              nextLabel={t('next')}
              onNavigate={(nextCursor, nextAction) => {
                setCursor(nextCursor);
                setAction(nextAction);
              }}
            />
          </>
        ) : (
          <p className="ml-1 text-sm text-[var(--text-muted)]">{t('noKeysForWorkflow')}</p>
        )}
      </div>

      <CreateApiKeyModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        lockedWorkflowId={workflowId}
        onCreated={(created) => setCreatedToken(created.apiKey)}
      />
      <ApiKeyCreatedModal token={createdToken} onClose={() => setCreatedToken(null)} />
      <EditApiKeyModal apiKey={keyToEdit} onClose={() => setKeyToEdit(null)} />
      <DeleteApiKeyModal apiKey={keyToDelete} onClose={() => setKeyToDelete(null)} />
    </div>
  );
}
