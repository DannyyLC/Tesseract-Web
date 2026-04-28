'use client';

import { useState, useMemo } from 'react';
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
import { useUsersDashboard, useUserStats, useUserMutations, usePendingInvitations } from '@/hooks/useUsers';
import { useAuth } from '@/hooks/useAuth';
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
} from '@/app/_shared/_utils/users.utils';
import { UserDetails } from './_components/user-details';
import { InviteUserModal } from './_components/InviteUserModal';
import PermissionGuard from '@/components/auth/PermissionGuard';

type FilterRole = 'all' | 'OWNER' | 'ADMIN' | 'VIEWER';
type ExtraDataSection = 'PENDING_INVITATIONS';

interface PendingInvitationItem {
  email: string;
  expiresAt: string;
  createdAt: string;
}


export default function UsersPage() {
  const [searchQuery, setSearchQuery] = useState('');
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

  // Hooks
  const { data: currentUser } = useAuth();
  const { data: usersData, isLoading: isLoadingUsers } = useUsersDashboard({
    search: searchQuery,
    role: filterRole === 'all' ? undefined : filterRole,
  });

  const { data: pendingInvitations, isLoading: isLoadingPendingInvitations } = usePendingInvitations();

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
    { value: 'all', label: 'Todos' },
    { value: 'OWNER', label: 'Owner' },
    { value: 'ADMIN', label: 'Admin' },
    { value: 'VIEWER', label: 'Viewer' },
  ];

  const extraDataSections: { label: string; value: ExtraDataSection }[] = [
    { value: 'PENDING_INVITATIONS', label: 'Invitaciones' },
  ]


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
      toast.success('Usuario actualizado correctamente');
    } catch (error) {
      toast.error('Error al actualizar el usuario');
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
      toast.success('Usuario eliminado correctamente');
    } catch (error) {
      toast.error('Error al eliminar el usuario');
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
      toast.success('Propiedad transferida correctamente');
    } catch (error) {
      toast.error('Error al transferir la propiedad');
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
      toast.success(`Usuario ${user.isActive ? 'desactivado' : 'activado'} correctamente`);
    } catch (error) {
      toast.error('Error al cambiar el estado del usuario');
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
          <h1 className="text-2xl font-bold text-black dark:text-white">Miembros</h1>
          <p className="mt-1 text-black/50 dark:text-white/50">
            Gestión de miembros de tu organización
          </p>
        </div>
        <PermissionGuard permissions="organization:invite_user">
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-2 rounded-xl bg-black px-5 py-2.5 font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-black"
          >
            <UserPlus size={18} />
            Invitar Usuario
          </button>
        </PermissionGuard>
      </div>

      {/* Stats Cards */}
      <div className="mb-8 grid grid-cols-2 gap-8 px-2 lg:grid-cols-5">
        {isLoadingStats ? (
          <div className="col-span-4 flex h-24 items-center justify-center">
            <Loader2 className="animate-spin text-black/20 dark:text-white/20" />
          </div>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex flex-col justify-between"
            >
              <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">
                Total Miembros
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <p className="font-geist-mono text-4xl font-light tracking-tight text-black dark:text-white">
                  {stats.total}
                </p>
                <span className="px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-500">
                  Registrados
                </span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="flex flex-col justify-between border-black/5 lg:border-l lg:pl-8 dark:border-white/5"
            >
              <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">
                Activos
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <p className="font-geist-mono text-4xl font-light tracking-tight text-black dark:text-white">
                  {stats.active}
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col justify-between border-black/5 lg:border-l lg:pl-8 dark:border-white/5"
            >
              <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">
                Inactivos
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <p className="font-geist-mono text-4xl font-light tracking-tight text-black dark:text-white">
                  {stats.inactive}
                </p>
                <span className="text-xs font-medium text-zinc-500">Sin acceso</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="flex flex-col justify-between border-black/5 lg:border-l lg:pl-8 dark:border-white/5"
            >
              <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">
                Verificados
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <p className="font-geist-mono text-4xl font-light tracking-tight text-black dark:text-white">
                  {stats.verified}
                </p>
              </div>
              

            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col justify-between border-black/5 lg:border-l lg:pl-8 dark:border-white/5"
            >
              <span className="mb-2 text-xs font-semibold uppercase tracking-wider text-black/50 dark:text-white/50">
                Invitaciones
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                {isLoadingPendingInvitations ? (
                  <Loader2 className="animate-spin text-black/30 dark:text-white/30" size={20} />
                ) : (
                  <p className="font-geist-mono text-4xl font-light tracking-tight text-black dark:text-white">
                    {stats.pendingInvitations}
                  </p>
                )}
                <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">
                  Pendientes
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
          <p className="text-xs font-semibold uppercase tracking-wider text-black/40 dark:text-white/40">
            Buscar miembros
          </p>
          <div className="relative">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30"
            />
            <input
              type="text"
              placeholder="Buscar por nombre o email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-full border-none bg-black/5 py-2 pl-10 pr-4 text-sm text-black transition-all placeholder:text-black/30 hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-black/5 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30 dark:hover:bg-white/10 dark:focus:ring-white/5"
            />
          </div>
        </div>

        {/* Role Filter Pills */}
        <div className="flex flex-wrap items-start gap-4 pb-1">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-black/40 dark:text-white/40">
              Filtrar por rol
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
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'border border-black/5 bg-white text-black/60 hover:bg-black/5 dark:border-white/5 dark:bg-[#141414] dark:text-white/60 dark:hover:bg-white/5'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-black/40 dark:text-white/40">
              Consultas adicionales
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
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'border border-black/5 bg-white text-black/60 hover:bg-black/5 dark:border-white/5 dark:bg-[#141414] dark:text-white/60 dark:hover:bg-white/5'
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
            <Loader2 className="animate-spin text-black/20 dark:text-white/20" />
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
                      className="overflow-hidden rounded-xl border border-black/5 bg-white shadow-sm dark:border-white/5 dark:bg-[#141414]"
                    >
                      <div className="p-5">
                        <div className="flex items-center gap-4">
                          <div
                            className={`h-12 w-12 rounded-full ${getAvatarColor(
                              invitation.email,
                            )} flex flex-shrink-0 items-center justify-center`}
                          >
                            <span className="font-semibold text-white">
                              {getInitials(invitation.email)}
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <h3 className="truncate font-semibold text-black dark:text-white">
                                {invitation.email}
                              </h3>
                              <span className="text-[10px] font-bold uppercase tracking-wide text-yellow-600 dark:text-yellow-400">
                                Pendiente
                              </span>
                            </div>
                            <p className="truncate text-sm text-black/50 dark:text-white/50">
                              Enviada {formatTimeAgo(invitation.createdAt as any)}
                            </p>
                          </div>

                          <div className="hidden text-right md:block">
                            <p className="text-xs text-black/40 dark:text-white/40">Expira</p>
                            <p
                              className={`text-sm ${
                                isExpired
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-black/70 dark:text-white/70'
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
                      ? 'border-black/5 bg-white shadow-md dark:border-white/5 dark:bg-[#141414]'
                      : 'bg-transparent hover:border-black/5 hover:bg-white hover:shadow-sm dark:hover:border-white/5 dark:hover:bg-[#141414]'
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
                          <span className="font-semibold text-white">{getInitials(user.name)}</span>
                        </div>
                        {/* Status indicator */}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 ${statusConfig.color} rounded-full border-2 border-white dark:border-[#141414]`}
                        />
                      </div>

                      {/* User Info */}
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <h3 className="truncate font-semibold text-black dark:text-white">
                            {user.name}
                          </h3>
                          <span
                            className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${roleConfig.color}`}
                          >
                            {roleConfig.label}
                          </span>
                        </div>
                        <p className="truncate text-sm text-black/50 dark:text-white/50">
                          {user.email}
                        </p>
                      </div>

                      {/* Last Login */}
                      <div className="hidden text-right md:block">
                        <p className="text-xs text-black/40 dark:text-white/40">Último acceso</p>
                        <p className="text-sm text-black/70 dark:text-white/70">
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
                        <div className="border-t border-black/5 bg-black/[0.01] px-5 pb-5 pt-2 dark:border-white/5 dark:bg-white/[0.01]">
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
                                  className="flex items-center gap-2 rounded-full border border-yellow-500/20 px-4 py-2 text-sm font-medium text-yellow-600 transition-all hover:bg-yellow-500/10 dark:text-yellow-400"
                                >
                                  <ArrowRightLeft size={16} />
                                  Transferir Propiedad
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
                                      className="flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-black"
                                    >
                                      <Edit3 size={16} />
                                      Editar
                                    </button>
                                  </PermissionGuard>
                                  
                                  <PermissionGuard permissions="users:delete">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteOpen(user);
                                      }}
                                      className="flex items-center gap-2 rounded-full border border-red-500/20 px-4 py-2 text-sm font-medium text-red-600 transition-all hover:bg-red-500/10 dark:text-red-400"
                                    >
                                      <Trash2 size={16} />
                                      Eliminar
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
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5">
              <Search size={24} className="text-black/30 dark:text-white/30" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-black dark:text-white">
              {isPendingInvitationsView
                ? searchQuery
                  ? `No se encontraron invitaciones para "${searchQuery}"`
                  : 'No hay invitaciones pendientes'
                : searchQuery
                  ? `No se encontraron resultados para "${searchQuery}"`
                  : filterRole !== 'all'
                    ? `No hay miembros con el rol ${roleFilters.find((f) => f.value === filterRole)?.label}`
                    : 'No se encontraron miembros'}
            </h3>
            <p className="text-black/50 dark:text-white/50">
              {isPendingInvitationsView
                ? 'Cuando envíes invitaciones aparecerán aquí'
                : searchQuery || filterRole !== 'all'
                  ? 'Intenta con otros términos de búsqueda o filtros'
                  : 'Comienza invitando miembros a tu organización'}
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
            title="Editar Usuario"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-black/70 dark:text-white/70">
                  Rol
                </label>
                <div className="grid grid-cols-2 gap-2">
                   {/* OWNER cannot be assigned here — use Transfer Ownership flow */}
                   {[UserRole.ADMIN, UserRole.VIEWER]
                    .map((role) => {
                      const config = getRoleConfig(role);
                      const isSelected = editFormData.role === role;
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => setEditFormData({ ...editFormData, role })}
                          className={`rounded-xl border px-4 py-3 transition-all ${
                            isSelected
                              ? `border-black bg-black/5 ring-2 ring-black dark:border-white dark:bg-white/5 dark:ring-white`
                              : 'border-black/5 bg-white hover:bg-black/5 dark:border-white/5 dark:bg-[#141414] dark:hover:bg-white/5'
                          }`}
                        >
                          <span className={`text-sm font-medium ${config.color}`}>
                            {config.label}
                          </span>
                        </button>
                      );
                    })}
                </div>
                <p className="mt-1 text-xs text-black/40 dark:text-white/40">
                  Para transferir la propiedad (OWNER) usa el botón dedicado en el perfil del usuario.
                </p>
              </div>

              <div className="py-2">
                <div className="flex items-center justify-between rounded-xl border border-black/10 p-3 dark:border-white/10">
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded-lg p-2 ${editFormData.isActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-black/5 text-black/40 dark:bg-white/5 dark:text-white/40'}`}
                    >
                      <Power size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-black dark:text-white">Estado</p>
                      <p className="text-xs text-black/50 dark:text-white/50">
                        {editFormData.isActive
                          ? 'El usuario está activo'
                          : 'El usuario está deshabilitado'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setEditFormData({ ...editFormData, isActive: !editFormData.isActive })
                    }
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      editFormData.isActive ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        editFormData.isActive ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 rounded-xl bg-black/5 px-4 py-3 font-medium text-black/70 transition-colors hover:bg-black/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={updateUser.isPending}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 font-medium text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-black"
                >
                  {updateUser.isPending ? (
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

      {/* Delete Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && modalUser && (
          <Modal
            isOpen={isDeleteModalOpen}
            onClose={() => setIsDeleteModalOpen(false)}
            title="Eliminar Usuario"
          >
            <div className="space-y-4">
              <p className="text-black/70 dark:text-white/70">
                ¿Estás seguro de que quieres eliminar a <strong>{modalUser.name}</strong>? Esta
                acción no se puede deshacer.
              </p>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 rounded-xl bg-black/5 px-4 py-3 font-medium text-black/70 transition-colors hover:bg-black/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteUser.isPending}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 font-medium text-white transition-colors hover:bg-red-600"
                >
                  {deleteUser.isPending ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    'Eliminar'
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
            title="Transferir Propiedad"
          >
            <div className="space-y-4">
              <div className="rounded-xl bg-yellow-500/10 p-4 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400">
                <div className="flex gap-3">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                  <p className="text-sm font-medium">
                    Advertencia de Seguridad: Esta acción es irreversible.
                  </p>
                </div>
                <p className="mt-2 text-sm opacity-90">
                  Al transferir la propiedad, perderás tu estatus de Owner y te convertirás en
                  Admin. El usuario <strong>{modalUser.name}</strong> tendrá control total sobre la
                  organización.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-black/70 dark:text-white/70">
                  Escribe <strong>confirmar</strong> para continuar
                </label>
                <input
                  type="text"
                  value={confirmTransferName}
                  onChange={(e) => setConfirmTransferName(e.target.value)}
                  placeholder="confirmar"
                  className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none focus:border-black/20 focus:ring-4 focus:ring-black/5 dark:border-white/10 dark:bg-[#141414] dark:text-white dark:focus:border-white/20 dark:focus:ring-white/5"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setIsTransferModalOpen(false)}
                  className="flex-1 rounded-xl bg-black/5 px-4 py-3 font-medium text-black/70 transition-colors hover:bg-black/10 dark:bg-white/5 dark:text-white/70 dark:hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleTransferOwnership}
                  disabled={transferOwnership.isPending || confirmTransferName !== 'confirmar'}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-yellow-500 px-4 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  title={
                    confirmTransferName !== 'confirmar' ? 'Escribe "confirmar" para habilitar' : ''
                  }
                >
                  {transferOwnership.isPending ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    'Transferir'
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
