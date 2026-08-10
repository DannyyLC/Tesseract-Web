'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { Key, Plus, Search } from 'lucide-react';
import { useApiKeys } from '@/hooks/identity/use-api-key';
import { ApiKeyListDto } from '@tesseract/types';
import PermissionGuard from '@/components/auth/permission-guard';
import { LogoLoader } from '@/components/ui/logo-loader';
import {
  ApiKeyCreatedModal,
  ApiKeyRow,
  ApiKeysPager,
  CreateApiKeyModal,
  DeleteApiKeyModal,
  EditApiKeyModal,
} from '@/components/api-keys';

const PAGE_SIZE = 10;

export default function ApiKeysPage() {
  const t = useTranslations('ApiKeys');

  const [searchQuery, setSearchQuery] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [action, setAction] = useState<'next' | 'prev' | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [keyToEdit, setKeyToEdit] = useState<ApiKeyListDto | null>(null);
  const [keyToDelete, setKeyToDelete] = useState<ApiKeyListDto | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  // La búsqueda se resuelve en el servidor, así que al cambiarla hay que volver a la
  // primera página: el cursor anterior apunta a una fila que quizá ya no está en el filtro.
  useEffect(() => {
    setCursor(null);
    setAction(null);
  }, [searchQuery]);

  const { data, isLoading } = useApiKeys({
    cursor,
    action,
    pageSize: PAGE_SIZE,
    search: searchQuery || undefined,
  });

  const apiKeys = data?.items ?? [];

  const handleNavigate = (nextCursor: string, nextAction: 'next' | 'prev') => {
    setCursor(nextCursor);
    setAction(nextAction);
  };

  if (isLoading) {
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
          <h1 className="text-2xl font-bold text-text-primary">{t('heading')}</h1>
          <p className="mt-1 text-text-secondary">{t('description')}</p>
        </div>
        <PermissionGuard permissions="api_keys:create">
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 self-start rounded-full bg-accent px-6 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90 sm:self-auto"
          >
            <Plus size={16} />
            {t('newButton')}
          </button>
        </PermissionGuard>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <input
          type="text"
          placeholder={t('searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="focus:ring-border-focus/10 w-full rounded-full border-none bg-surface-secondary py-2 pl-10 pr-4 text-sm text-text-primary transition-all placeholder:text-input-placeholder focus:outline-none focus:ring-2"
        />
      </div>

      {/* Keys List */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {apiKeys.map((key, index) => (
            <ApiKeyRow
              key={key.id}
              apiKey={key}
              index={index}
              onEdit={setKeyToEdit}
              onDelete={setKeyToDelete}
            />
          ))}
        </AnimatePresence>

        {apiKeys.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-16 text-center"
          >
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-secondary">
              <Key size={24} className="text-text-tertiary" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-text-primary">{t('noApiKeys')}</h3>
            <p className="text-text-secondary">{t('noApiKeysDesc')}</p>
          </motion.div>
        )}

        <ApiKeysPager
          prevCursor={data?.prevCursor ?? null}
          nextCursor={data?.nextCursor ?? null}
          nextPageAvailable={data?.nextPageAvailable ?? false}
          onNavigate={handleNavigate}
        />
      </div>

      <CreateApiKeyModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(created) => setCreatedToken(created.apiKey)}
      />
      <ApiKeyCreatedModal token={createdToken} onClose={() => setCreatedToken(null)} />
      <EditApiKeyModal apiKey={keyToEdit} onClose={() => setKeyToEdit(null)} />
      <DeleteApiKeyModal apiKey={keyToDelete} onClose={() => setKeyToDelete(null)} />
    </div>
  );
}
