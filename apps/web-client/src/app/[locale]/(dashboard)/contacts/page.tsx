'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_PAGE_SIZE, DashboardEndUserDto, EndUserBlockedFilter } from '@tesseract/types';
import { useEndUsers, useEndUserMutations } from '@/hooks/identity/use-end-users';
import { LogoLoader } from '@/components/ui/logo-loader';
import { CursorPager } from '@/components/ui/cursor-pager';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import {
  AddContactMenu,
  AddWhatsappContactModal,
  BlockContactModal,
  ContactCard,
  EditContactModal,
  describeContact,
} from '@/components/contacts';
import PermissionGuard from '@/components/auth/permission-guard';


const FILTERS: EndUserBlockedFilter[] = ['all', 'active', 'blocked'];

export default function ContactsPage() {
  const t = useTranslations('Contacts');

  const [searchQuery, setSearchQuery] = useState('');
  const [blocked, setBlocked] = useState<EndUserBlockedFilter>('all');
  const [cursor, setCursor] = useState<string | null>(null);
  const [action, setAction] = useState<'next' | 'prev' | null>(null);
  const [contactToBlock, setContactToBlock] = useState<DashboardEndUserDto | null>(null);
  const [contactToEdit, setContactToEdit] = useState<DashboardEndUserDto | null>(null);
  const [contactToDelete, setContactToDelete] = useState<DashboardEndUserDto | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [isAddWhatsappOpen, setIsAddWhatsappOpen] = useState(false);

  // Búsqueda y filtro se resuelven en el servidor, así que al cambiarlos hay que volver a la
  // primera página: el cursor anterior apunta a una fila que quizá ya no entra en el filtro.
  useEffect(() => {
    setCursor(null);
    setAction(null);
  }, [searchQuery, blocked]);

  const { data, isLoading } = useEndUsers({
    cursor,
    action,
    pageSize: DEFAULT_PAGE_SIZE,
    search: searchQuery || undefined,
    blocked,
  });

  const { unblockEndUser, deleteEndUser } = useEndUserMutations();
  const contacts = data?.items ?? [];

  const handleUnblock = async (contact: DashboardEndUserDto) => {
    setUnblockingId(contact.id);
    try {
      await unblockEndUser.mutateAsync(contact.id);
    } finally {
      setUnblockingId(null);
    }
  };

  const handleDelete = async () => {
    if (!contactToDelete) return;

    try {
      await deleteEndUser.mutateAsync(contactToDelete.id);
      toast.success(t('deleteSuccess'));
      setContactToDelete(null);
    } catch (err: any) {
      const backendMessage = typeof err?.message === 'string' ? err.message : '';
      toast.error(backendMessage || t('deleteError'));
    }
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('heading')}</h1>
          <p className="mt-1 text-text-secondary">{t('description')}</p>
        </div>

        <PermissionGuard permissions="end_users:create">
          <AddContactMenu onSelectWhatsapp={() => setIsAddWhatsappOpen(true)} />
        </PermissionGuard>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="focus:ring-border-focus/10 w-full rounded-full border-none bg-surface-secondary py-2 pl-10 pr-4 text-sm text-text-primary transition-all placeholder:text-input-placeholder focus:outline-none focus:ring-2"
          />
        </div>

        <div className="flex shrink-0 items-center gap-1 rounded-full bg-surface-secondary p-1">
          {FILTERS.map((filter) => (
            <button
              key={filter}
              onClick={() => setBlocked(filter)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                blocked === filter
                  ? 'bg-surface-elevated text-text-primary'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {t(`filter_${filter}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Listado */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {contacts.map((contact, index) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              index={index}
              onBlock={setContactToBlock}
              onUnblock={handleUnblock}
              onEdit={setContactToEdit}
              onDelete={setContactToDelete}
              isUnblocking={unblockingId === contact.id}
            />
          ))}
        </AnimatePresence>

        {contacts.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-secondary">
              <Users size={24} className="text-text-tertiary" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-text-primary">
              {searchQuery || blocked !== 'all' ? t('noMatches') : t('noContacts')}
            </h3>
            <p className="text-text-secondary">
              {searchQuery || blocked !== 'all' ? t('noMatchesDesc') : t('noContactsDesc')}
            </p>
          </motion.div>
        )}

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
      </div>

      <BlockContactModal
        endUserId={contactToBlock?.id ?? null}
        contactLabel={contactToBlock ? describeContact(contactToBlock).label : ''}
        onClose={() => setContactToBlock(null)}
      />

      <AddWhatsappContactModal
        isOpen={isAddWhatsappOpen}
        onClose={() => setIsAddWhatsappOpen(false)}
      />

      <EditContactModal contact={contactToEdit} onClose={() => setContactToEdit(null)} />

      <ConfirmModal
        isOpen={Boolean(contactToDelete)}
        onClose={() => setContactToDelete(null)}
        onConfirm={handleDelete}
        variant="danger"
        title={t('deleteModalTitle')}
        message={
          contactToDelete
            ? t('deleteModalMessage', { contact: describeContact(contactToDelete).label })
            : ''
        }
        confirmLabel={t('deleteConfirmLabel')}
        cancelLabel={t('cancel')}
      />
    </div>
  );
}
