'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, Clock, Loader2 } from 'lucide-react';
import { useInfiniteAdminConversations } from '@/hooks/messaging/use-admin-conversations';
import { formatTimeAgo } from '@/utils/users.utils';
import { toIntlLocale } from '@/lib/intl-locale';

interface Props {
  organizationId: string;
  workflowId: string;
  onSelect: (conversationId: string) => void;
}

/**
 * Ícono de reloj que abre las conversaciones reales del workflow — cualquier canal, no
 * solo las de esta pestaña de prueba — para poder retomar una y rastrear un error que
 * reportó un cliente. "Solo con error" empieza activado: es el caso de uso que importa,
 * si todo funciona no hay nada que revisar.
 */
export function ConversationHistoryMenu({ organizationId, workflowId, onSelect }: Props) {
  const t = useTranslations('Admin.ConversationHistoryMenu');
  const tTimeAgo = useTranslations('Shared.TimeAgo');
  const intlLocale = toIntlLocale(useLocale());
  const [isOpen, setIsOpen] = useState(false);
  const [onlyErrors, setOnlyErrors] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteAdminConversations({ organizationId, workflowId, onlyErrors }, isOpen);

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen || !hasNextPage) return;
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage();
    });
    if (loadMoreRef.current) observerRef.current.observe(loadMoreRef.current);

    return () => observerRef.current?.disconnect();
  }, [isOpen, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        title={t('conversationsTooltip')}
        aria-label={t('conversationsTooltip')}
        className="flex-shrink-0 rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
      >
        <Clock size={18} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-medium text-text-secondary">{t('conversationsLabel')}</span>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={onlyErrors}
                onChange={(e) => setOnlyErrors(e.target.checked)}
                className="h-3.5 w-3.5 accent-danger-500"
              />
              {t('onlyWithError')}
            </label>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 size={16} className="animate-spin text-text-tertiary" />
              </div>
            ) : items.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-text-secondary">
                {onlyErrors ? t('noErrorConversations') : t('noConversations')}
              </p>
            ) : (
              items.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onSelect(c.id);
                    setIsOpen(false);
                  }}
                  className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-secondary"
                >
                  {c.hasError && <AlertCircle size={13} className="mt-0.5 shrink-0 text-danger-500" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-text-primary">{c.title || t('untitled')}</p>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      {formatTimeAgo(c.lastMessageAt, tTimeAgo, intlLocale)} ·{' '}
                      {t('messagesCount', { count: c.messageCount })}
                    </p>
                  </div>
                </button>
              ))
            )}
            {hasNextPage && (
              <div ref={loadMoreRef} className="py-2 text-center text-xs text-text-secondary">
                {isFetchingNextPage ? t('loadingMore') : ''}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
