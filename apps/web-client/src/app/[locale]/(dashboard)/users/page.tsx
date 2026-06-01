'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  UserPlus,
  Edit3,
  Trash2,
  Loader2,
  Power,
  ArrowRightLeft,
  AlertTriangle,
} from 'lucide-react';
import {
  useUsersDashboard,
  useUserStats,
  useUserMutations,
  usePendingInvitations,
} from '@/hooks/identity/use-users';
import { useAuth } from '@/hooks/identity/use-auth';
import { DashboardUserDataDto, UserRole } from '@tesseract/types';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { LogoLoader } from '@/components/ui/logo-loader';
import {
  getRoleConfig,
  getStatusConfig,
  formatTimeAgo,
  getInitials,
  getAvatarColor,
} from '@/utils/users.utils';
import { UserDetails } from './_components/user-details';
import { InviteUserModal } from './_components/invite-user-modal';
import PermissionGuard from '@/components/auth/permission-guard';

type FilterRole = 'all' | 'OWNER' | 'ADMIN' | 'VIEWER';
type ExtraDataSection = 'PENDING_INVITATIONS';

interface PendingInvitationItem {
  email: string;
  expiresAt: string;
  createdAt: string;
}

export default function UsersPage() {
  const t = useTranslations('Users');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterRole, setFilterRole] = useState<FilterRole>('all');
  const [extraDataSection, setExtraDataSection] = useState<ExtraDataSection | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Expansion State
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // Edit & Delete States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [modalUser, setModalUser] = useState<DashboardUserDataDto | null>(null);
  const [editFormData, setEditFormData] = useState({ role: '', isActive: true });
  const [confirmTransferName, setConfirmTransferName] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Hooks
  const { data: currentUser } = useAuth();
  const { data: usersData, isLoading: isLoadingUsers } = useUsersDashboard({
    search: debouncedSearch,
    role: filterRole === 'all' ? undefined : filterRole,
  });

  const { data: pendingInvitations, isLoading: isLoadingPendingInvitations } =
    usePendingInvitations();

  const { data: statsData, isLoading: isLoadingStats } = useUserStats();
  const { updateUser, deleteUser, transferOwnership } = useUserMutations();

  const isPendingInvitationsView = extraDataSection === 'PENDING_INVITATIONS';
  const isListLoading = isPendingInvitationsView ? isLoadingPendingInvitations : isLoadingUsers;

  const pendingInvitationItems = useMemo(() => {
    const invitations = (pendingInvitations ?? []) as PendingInvitationItem[];
    const normalizedSearch = searchQuery.trim().toLowerCase();

    if (!normalizedSearch) return invitations;

    return invitations.filter((invitation) =>
      invitation.email.toLowerCase().includes(normalizedSearch),
    );
  }, [pendingInvitations, searchQuery]);

  // Mapped Stats
  const stats = useMemo(() => {
    if (!statsData) {
      return { total: 0, active: 0, inactive: 0, verified: 0, pendingInvitations: 0 };
    }

    return {
      total: statsData.total || 0,
      active: statsData.active || 0,
      inactive: statsData.inactive || 0,
      verified: statsData.verified || 0,
      pendingInvitations: (pendingInvitations as PendingInvitationItem[] | undefined)?.length || 0,
    };
  }, [statsData, pendingInvitations]);

  const roleFilters: { value: FilterRole; label: string }[] = [
    { value: 'all', label: t('filterAll') },
    { value: 'OWNER', label: 'Owner' },
    { value: 'ADMIN', label: 'Admin' },
    { value: 'VIEWER', label: 'Viewer' },
  ];

  const extraDataSections: { label: string; value: ExtraDataSection }[] = [
    { value: 'PENDING_INVITATIONS', label: t('invitationsSection') },
  ];

  // Actions

  /**
   * Determines if the current user can edit (role/status) a target user.
   * - Nobody can edit/delete themselves
   * - OWNER can edit ADMIN and VIEWER (not OWNER — use transfer-ownership)
   * - ADMIN can edit ADMIN and VIEWER (not OWNER)
   * - VIEWER cannot edit anyone
   */
  const canEditUser = (targetUser: DashboardUserDataDto): boolean => {
    if (!currentUser) return false;
    if (targetUser.id === currentUser.id) return false; // cannot edit yourself
    if (currentUser.role === UserRole.VIEWER) return false;
    if (targetUser.role === UserRole.OWNER) return false; // nobody edits the owner directly
    return true;
  };

  const handleEditOpen = (user: DashboardUserDataDto) => {
    setModalUser(user);
    setEditFormData({ role: user.role, isActive: user.isActive });
    setIsEditModalOpen(true);
  };

  const handleUpdate = async () => {
    if (!modalUser) return;
    try {
      await updateUser.mutateAsync({
        id: modalUser.id,
        data: { role: editFormData.role as UserRole, isActive: editFormData.isActive },
      });
      setIsEditModalOpen(false);
      setModalUser(null);
      toast.success(t('userUpdated'));
    } catch (error) {
      toast.error(t('updateUserError'));
    }
  };

  const handleDeleteOpen = (user: DashboardUserDataDto) => {
    setModalUser(user);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!modalUser) return;
    try {
      await deleteUser.mutateAsync(modalUser.id);
      setIsDeleteModalOpen(false);
      setModalUser(null);
      toast.success(t('userDeleted'));
    } catch (error) {
      toast.error(t('deleteUserError'));
    }
  };

  const handleTransferOpen = (user: DashboardUserDataDto) => {
    setModalUser(user);
    setConfirmTransferName('');
    setIsTransferModalOpen(true);
  };

  const handleTransferOwnership = async () => {
    if (!modalUser) return;
    try {
      await transferOwnership.mutateAsync(modalUser.id);
      setIsTransferModalOpen(false);
      setModalUser(null);
      toast.success(t('transferSuccess'));
    } catch (error) {
      toast.error(t('transferError'));
    }
  };

  const handleToggleStatus = async (e: React.MouseEvent, user: DashboardUserDataDto) => {
    e.stopPropagation();
    if (!canEditUser(user)) return; // guard against stale renders
    try {
      await updateUser.mutateAsync({
        id: user.id,
        data: { isActive: !user.isActive },
      });
      toast.success(user.isActive ? t('userDeactivated') : t('userActivated'));
    } catch (error) {
      toast.error(t('toggleStatusError'));
    }
  };

  if (isLoadingStats) {
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
          <p className="mt-1 text-text-secondary">
            {t('description')}
          </p>
        </div>
        <PermissionGuard permissions="organization:invite_user">
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 font-medium text-text-inverse transition-opacity hover:opacity-90"
          >
            <UserPlus size={18} />
            {t('inviteButton')}
          </button>
        </PermissionGuard>
      </div>

      {/* Stats Cards */}
      <div className="mb-8 grid grid-cols-2 gap-8 px-2 lg:grid-cols-5">
        {isLoadingStats ? (
          <div className="col-span-4 flex h-24 items-center justify-center">
            <Loader2 className="animate-spin text-text-tertiary" />
          </div>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex flex-col justify-between"
            >
              <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                {t('totalMembers')}
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
                  {stats.total}
                </p>
                <span className="px-2 py-0.5 text-xs font-medium text-info-600">
                  {t('registered')}
                </span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="flex flex-col justify-between border-border lg:border-l lg:pl-8"
            >
              <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                {t('active')}
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
                  {stats.active}
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col justify-between border-border lg:border-l lg:pl-8"
            >
              <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                {t('inactive')}
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
                  {stats.inactive}
                </p>
                <span className="text-xs font-medium text-neutral-500">{t('noAccess')}</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="flex flex-col justify-between border-border lg:border-l lg:pl-8"
            >
              <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                {t('verified')}
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
                  {stats.verified}
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col justify-between border-border lg:border-l lg:pl-8"
            >
              <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                {t('invitations')}
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                {isLoadingPendingInvitations ? (
                  <Loader2 className="animate-spin text-text-tertiary" size={20} />
                ) : (
                  <p className="font-geist-mono text-4xl font-light tracking-tight text-text-primary">
                    {stats.pendingInvitations}
                  </p>
                )}
                <span className="text-xs font-medium text-warning-600">
                  {t('pending')}
                </span>
              </div>
            </motion.div>
          </>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Search */}
        <div className="flex-1 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
            {t('searchLabel')}
          </p>
          <div className="relative">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-full border-none bg-surface-secondary py-2 pl-10 pr-4 text-sm text-text-primary transition-all placeholder:text-input-placeholder focus:outline-none focus:ring-2 focus:ring-border-focus/10"
            />
          </div>
        </div>

        {/* Role Filter Pills */}
        <div className="flex flex-wrap items-start gap-4 pb-1">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('filterByRole')}
            </p>
            <div className="flex gap-2 overflow-x-auto">
              {roleFilters.map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => {
                    setExtraDataSection(null);
                    setFilterRole(filter.value);
                  }}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    extraDataSection === null && filterRole === filter.value
                      ? 'bg-accent text-text-inverse'
                      : 'border border-border bg-surface-panel text-text-secondary hover:bg-surface-secondary'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('extraQueryLabel')}
            </p>
            <div className="flex gap-2 overflow-x-auto">
              {extraDataSections.map((section) => (
                <button
                  key={section.value}
                  onClick={() => {
                    setFilterRole('all');
                    setExtraDataSection(section.value);
                  }}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    extraDataSection === section.value
                      ? 'bg-accent text-text-inverse'
                      : 'border border-border bg-surface-panel text-text-secondary hover:bg-surface-secondary'
                  }`}
                >
                  {section.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Users List */}
      <div className="space-y-3">
        {isListLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="animate-spin text-text-tertiary" />
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {isPendingInvitationsView
              ? pendingInvitationItems.map((invitation, index) => {
                  const isExpired = new Date(invitation.expiresAt) < new Date();

                  return (
                    <motion.div
                      key={`${invitation.email}-${invitation.createdAt}`}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: index * 0.05 }}
                      className="overflow-hidden rounded-xl border border-border bg-surface-panel shadow-sm"
                    >
                      <div className="p-5">
                        <div className="flex items-center gap-4">
                          <div
                            className={`h-12 w-12 rounded-full ${getAvatarColor(
                              invitation.email,
                            )} flex flex-shrink-0 items-center justify-center`}
                          >
                            <span className="font-semibold text-brand-white">
                              {getInitials(invitation.email)}
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <h3 className="truncate font-semibold text-text-primary">
                                {invitation.email}
                              </h3>
                              <span className="text-[10px] font-bold uppercase tracking-wide text-warning-600">
                                {t('pendingBadge')}
                              </span>
                            </div>
                            <p className="truncate text-sm text-text-secondary">
                              {t('sentTimeAgo', { time: formatTimeAgo(invitation.createdAt as any) })}
                            </p>
                          </div>

                          <div className="hidden text-right md:block">
                            <p className="text-xs text-text-tertiary">{t('expires')}</p>
                            <p
                              className={`text-sm ${
                                isExpired
                                  ? 'text-danger-600'
                                  : 'text-text-primary'
                              }`}
                            >
                              {new Date(invitation.expiresAt).toLocaleString('es-ES')}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              : usersData?.items.map((user, index) => {
                  const roleConfig = getRoleConfig(user.role);
                  const statusConfig = getStatusConfig(user.isActive);
                  const isExpanded = expandedUserId === user.id;

                  return (
                    <motion.div
                      key={user.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: index * 0.05 }}
                      className={`overflow-hidden rounded-xl border border-transparent transition-all duration-200 ${
                        isExpanded
                          ? 'border-border bg-surface-panel shadow-md'
                          : 'bg-transparent hover:border-border hover:bg-surface-panel hover:shadow-sm'
                      }`}
                    >
                      <div
                        className="cursor-pointer p-5"
                        onClick={() => setExpandedUserId(isExpanded ? null : user.id!)}
                      >
                        <div className="flex items-center gap-4">
                          {/* Avatar */}
                          <div className="relative">
                            <div
                              className={`h-12 w-12 rounded-full ${getAvatarColor(
                                user.name,
                              )} flex flex-shrink-0 items-center justify-center`}
                            >
                              <span className="font-semibold text-brand-white">
                                {getInitials(user.name)}
                              </span>
                            </div>
                            {/* Status indicator */}
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 ${statusConfig.color} rounded-full border-2 border-surface-panel`}
                            />
                          </div>

                          {/* User Info */}
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <h3 className="truncate font-semibold text-text-primary">
                                {user.name}
                              </h3>
                              <span
                                className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${roleConfig.color}`}
                              >
                                {roleConfig.label}
                              </span>
                            </div>
                            <p className="truncate text-sm text-text-secondary">
                              {user.email}
                            </p>
                          </div>

                          {/* Last Login */}
                          <div className="hidden text-right md:block">
                            <p className="text-xs text-text-tertiary">
                              {t('lastAccess')}
                            </p>
                            <p className="text-sm text-text-primary">
                              {formatTimeAgo(user.lastLoginAt)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Actions */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-border bg-surface px-5 pb-5 pt-2">
                              <UserDetails userId={user.id} />

                              <div className="flex flex-wrap gap-2">
                                {/* Transfer Ownership - only for non-owner targets that are not yourself */}
                                {user.role !== UserRole.OWNER && user.id !== currentUser?.id && (
                                  <PermissionGuard permissions="users:transfer_ownership">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleTransferOpen(user);
                                      }}
                                      className="flex items-center gap-2 rounded-full border border-warning-600 px-4 py-2 text-sm font-medium text-warning-600 transition-all hover:bg-warning-500/10"
                                    >
                                      <ArrowRightLeft size={16} />
                                      {t('transferOwnership')}
                                    </button>
                                  </PermissionGuard>
                                )}

                                {/* Edit/Delete — respects full hierarchy + no self-edit */}
                                {canEditUser(user) && (
                                  <>
                                    <PermissionGuard permissions="users:update">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleEditOpen(user);
                                        }}
                                        className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90"
                                      >
                                        <Edit3 size={16} />
                                        {t('editButton')}
                                      </button>
                                    </PermissionGuard>

                                    <PermissionGuard permissions="users:delete">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteOpen(user);
                                        }}
                                        className="flex items-center gap-2 rounded-full border border-danger-600 px-4 py-2 text-sm font-medium text-danger-600 transition-all hover:bg-danger-500/10"
                                      >
                                        <Trash2 size={16} />
                                        {t('deleteButton')}
                                      </button>
                                    </PermissionGuard>
                                  </>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
          </AnimatePresence>
        )}

        {/* Empty State */}
        {!isListLoading &&
          (isPendingInvitationsView
            ? pendingInvitationItems.length === 0
            : !usersData?.items || usersData.items.length === 0) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-16 text-center"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-secondary">
                <Search size={24} className="text-text-tertiary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-text-primary">
                {isPendingInvitationsView
                  ? searchQuery
                    ? t('noInvitationsForQuery', { query: searchQuery })
                    : t('noPendingInvitations')
                  : searchQuery
                    ? t('noResultsForQuery', { query: searchQuery })
                    : filterRole !== 'all'
                      ? t('noMembersWithRole', { role: roleFilters.find((f) => f.value === filterRole)?.label })
                      : t('noMembers')}
              </h3>
              <p className="text-text-secondary">
                {isPendingInvitationsView
                  ? t('invitationsWillAppear')
                  : searchQuery || filterRole !== 'all'
                    ? t('tryOtherSearch')
                    : t('startInviting')}
              </p>
            </motion.div>
          )}
      </div>

      {/* Invite User Modal */}
      <InviteUserModal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} />

      {/* Edit Modal */}
      <AnimatePresence>
        {isEditModalOpen && modalUser && (
          <Modal
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            title={t('editModalTitle')}
          >
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-text-primary">
                  {t('roleLabel')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {/* OWNER cannot be assigned here — use Transfer Ownership flow */}
                  {[UserRole.ADMIN, UserRole.VIEWER].map((role) => {
                    const config = getRoleConfig(role);
                    const isSelected = editFormData.role === role;
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setEditFormData({ ...editFormData, role })}
                        className={`rounded-xl border px-4 py-3 transition-all ${
                          isSelected
                            ? 'border-border-focus bg-surface-secondary ring-2 ring-border-focus'
                            : 'border-border bg-surface hover:bg-surface-secondary'
                        }`}
                      >
                        <span className={`text-sm font-medium ${config.color}`}>
                          {config.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-text-tertiary">
                  {t('ownerNote')}
                </p>
              </div>

              <div className="py-2">
                <div className="flex items-center justify-between rounded-xl border border-border p-3 ">
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded-lg p-2 ${editFormData.isActive ? 'bg-success-500/10 text-success-500' : 'bg-surface-secondary text-text-tertiary'}`}
                    >
                      <Power size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{t('statusLabel')}</p>
                      <p className="text-xs text-text-secondary">
                        {editFormData.isActive ? t('userActive') : t('userInactive')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setEditFormData({ ...editFormData, isActive: !editFormData.isActive })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      editFormData.isActive ? 'bg-success-500' : 'bg-border-hover'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-surface-elevated transition-transform ${
                        editFormData.isActive ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 rounded-xl bg-surface-secondary px-4 py-3 font-medium text-text-secondary transition-colors hover:bg-surface-elevated"
                >
                  {t('cancelButton')}
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={updateUser.isPending}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-medium text-text-inverse transition-opacity hover:opacity-90"
                >
                  {updateUser.isPending ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    t('saveButton')
                  )}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Delete Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && modalUser && (
          <Modal
            isOpen={isDeleteModalOpen}
            onClose={() => setIsDeleteModalOpen(false)}
            title={t('deleteModalTitle')}
          >
            <div className="space-y-4">
              <p className="text-text-primary">
                {t('deleteConfirmBefore')} <strong>{modalUser.name}</strong>{t('deleteConfirmAfter')}
              </p>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 rounded-xl bg-surface-secondary px-4 py-3 font-medium text-text-secondary transition-colors hover:bg-surface-elevated"
                >
                  {t('cancelButton')}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteUser.isPending}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger px-4 py-3 font-medium text-brand-white transition-colors hover:bg-danger-600"
                >
                  {deleteUser.isPending ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    t('confirmDeleteButton')
                  )}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Transfer Ownership Modal */}
      <AnimatePresence>
        {isTransferModalOpen && modalUser && (
          <Modal
            isOpen={isTransferModalOpen}
            onClose={() => setIsTransferModalOpen(false)}
            title={t('transferModalTitle')}
          >
            <div className="space-y-4">
              <div className="rounded-xl bg-warning-500/10 p-4 text-warning-600">
                <div className="flex gap-3">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                  <p className="text-sm font-medium">
                    {t('transferWarningHeading')}
                  </p>
                </div>
                <p className="mt-2 text-sm opacity-90">
                  {t('transferWarningBefore')} <strong>{modalUser.name}</strong> {t('transferWarningAfter')}
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-text-primary">
                  {t('transferConfirmBefore')} <strong>{t('transferConfirmKeyword')}</strong> {t('transferConfirmAfter')}
                </label>
                <input
                  type="text"
                  value={confirmTransferName}
                  onChange={(e) => setConfirmTransferName(e.target.value)}
                  placeholder={t('transferConfirmPlaceholder')}
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary outline-none focus:border-border-hover focus:ring-4 focus:ring-border-focus/5"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setIsTransferModalOpen(false)}
                  className="flex-1 rounded-xl bg-surface-secondary px-4 py-3 font-medium text-text-secondary transition-colors hover:bg-surface-elevated"
                >
                  {t('cancelButton')}
                </button>
                <button
                  onClick={handleTransferOwnership}
                  disabled={transferOwnership.isPending || confirmTransferName !== t('transferConfirmKeyword')}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-warning-500 px-4 py-3 font-medium text-brand-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  title={
                    confirmTransferName !== t('transferConfirmKeyword') ? t('writeConfirmar') : ''
                  }
                >
                  {transferOwnership.isPending ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    t('transferButton')
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
