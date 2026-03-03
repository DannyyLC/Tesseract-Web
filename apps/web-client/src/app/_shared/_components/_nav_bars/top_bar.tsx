'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, Bell, ChevronRight, LogOut, User, CheckCheck, Loader2 } from 'lucide-react';
import { useAuth, useLogout } from '@/hooks/useAuth';
import { useUnreadNotificationsCount, useNotificationMutations } from '@/hooks/useNotifications';
import NotificationList from '../notifications/notification-list';
import { Modal } from '@/components/ui/modal';

interface TopBarProps {
  onMenuClick: () => void;
  isSidebarCollapsed: boolean;
}

const routeNames: Record<string, string> = {
  dashboard: 'Dashboard',
  workflows: 'Workflows',
  executions: 'Ejecuciones',
  credits: 'Créditos y Facturación',
  users: 'Miembros',
  settings: 'Configuración',
  conversations: 'Conversaciones',
  'api-keys': 'API Keys',
};

export default function TopBar({ onMenuClick, isSidebarCollapsed }: TopBarProps) {
  const pathname = usePathname();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isMarkReadModalOpen, setIsMarkReadModalOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const { data: authUser } = useAuth();
  const logoutMutation = useLogout();

  // Queries & Mutations
  const { data: unreadCount = 0 } = useUnreadNotificationsCount();
  const { markAllAsRead } = useNotificationMutations();

  const user = {
    name: authUser?.name || 'Usuario',
    email: authUser?.email || '',
    role: authUser?.role || 'Viewer',
    avatar: null,
    organization: authUser?.organizationName || 'Mi Organización',
  };

  const formatSegment = (segment: string) => {
    // Si está en el diccionario, usar eso
    if (routeNames[segment]) return routeNames[segment];

    // Si parece un ID largo (más de 20 caracteres o mezcla de números y letras compleja), truncarlo
    // UUIDs suelen ser 36 chars.
    if (
      segment.length > 20 ||
      (segment.length > 10 && /\d/.test(segment) && /[a-zA-Z]/.test(segment))
    ) {
      return `#${segment.substring(0, 8)}...`;
    }

    // Formatear texto genérico: reemplazar guiones/bajos con espacios y capitalizar
    return segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const generateBreadcrumbs = () => {
    const segments = pathname.split('/').filter(Boolean);
    const breadcrumbs: any[] = [];

    let currentPath = '';

    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const label = formatSegment(segment);
      breadcrumbs.push({ label, href: currentPath });
    });

    // Si estamos en la raíz o array vacío, mostrar Dashboard
    if (breadcrumbs.length === 0) {
      breadcrumbs.push({ label: 'Dashboard', href: '/' });
    } else if (breadcrumbs[0].href !== '/dashboard' && breadcrumbs[0].href !== '/') {
      // Asegurar que siempre haya una forma de volver al inicio si no es el primer segmento
      breadcrumbs.unshift({ label: 'Dashboard', href: '/dashboard' });
    }

    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAllAsRead = () => {
    markAllAsRead.mutate();
    setIsMarkReadModalOpen(false);
  };

  return (
    <>
      <header
        className={`fixed left-0 right-0 top-0 z-30 h-16 border-b border-black/5 bg-white/80 backdrop-blur-xl transition-all duration-300 dark:border-white/5 dark:bg-[#0A0A0A]/80 ${
          isSidebarCollapsed ? 'lg:left-20' : 'lg:left-[260px]'
        }`}
      >
        <div className="flex h-full items-center justify-between px-4 md:px-6">
          {/* Left Section */}
          <div className="flex items-center gap-4">
            <button
              onClick={onMenuClick}
              className="rounded-lg p-2 transition-colors hover:bg-black/5 lg:hidden dark:hover:bg-white/5"
            >
              <Menu size={20} className="text-black dark:text-white" />
            </button>

            <nav className="hidden items-center gap-2 text-sm md:flex">
              {breadcrumbs.map((crumb, index) => (
                <div key={crumb.href} className="flex items-center gap-2">
                  {index > 0 && (
                    <ChevronRight size={14} className="text-black/30 dark:text-white/30" />
                  )}
                  <Link
                    href={crumb.href}
                    className={`transition-colors ${
                      index === breadcrumbs.length - 1
                        ? 'font-medium text-black dark:text-white'
                        : 'text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white'
                    }`}
                  >
                    {crumb.label}
                  </Link>
                </div>
              ))}
            </nav>

            <h1 className="text-lg font-semibold text-black md:hidden dark:text-white">
              {breadcrumbs[breadcrumbs.length - 1]?.label || 'Dashboard'}
            </h1>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-2">
            {/* Notifications */}
            <div ref={notificationsRef} className="relative">
              <button
                onClick={() => {
                  setIsNotificationsOpen(!isNotificationsOpen);
                  setIsProfileOpen(false);
                }}
                className="relative rounded-lg p-2 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Bell size={20} className="text-black/60 dark:text-white/60" />
                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-[#0A0A0A]">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {isNotificationsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-80 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-xl shadow-black/10 sm:w-96 dark:border-white/5 dark:bg-[#141414] dark:shadow-black/30"
                  >
                    <div className="flex items-center justify-between border-b border-black/5 p-4 dark:border-white/5">
                      <h3 className="font-semibold text-black dark:text-white">Notificaciones</h3>
                      {unreadCount > 0 && (
                        <button
                          onClick={() => setIsMarkReadModalOpen(true)}
                          disabled={markAllAsRead.isPending}
                          className="flex items-center gap-1 text-xs font-medium text-blue-500 hover:text-blue-600 disabled:opacity-50"
                        >
                          {markAllAsRead.isPending ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <CheckCheck size={12} />
                          )}
                          Marcar leídas
                        </button>
                      )}
                    </div>

                    <NotificationList />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Profile */}
            <div ref={profileRef} className="relative">
              <button
                onClick={() => {
                  setIsProfileOpen(!isProfileOpen);
                  setIsNotificationsOpen(false);
                }}
                className="flex items-center gap-2 rounded-xl p-1 pr-2 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black dark:bg-white">
                  <span className="text-sm font-semibold text-white dark:text-black">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              </button>

              <AnimatePresence>
                {isProfileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-64 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-xl shadow-black/10 dark:border-white/5 dark:bg-[#141414] dark:shadow-black/30"
                  >
                    <div className="border-b border-black/5 p-4 dark:border-white/5">
                      <div className="mb-0.5 flex items-center gap-2">
                        <p className="font-semibold text-black dark:text-white">{user.name}</p>
                        <span className="rounded-md border border-black/5 bg-black/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-black/60 dark:border-white/5 dark:bg-white/10 dark:text-white/60">
                          {user.role}
                        </span>
                      </div>
                      <p
                        className="truncate text-sm text-black/50 dark:text-white/50"
                        title={user.email}
                      >
                        {user.email}
                      </p>
                      <p className="mt-1 text-xs text-black/40 dark:text-white/40">
                        {user.organization}
                      </p>
                    </div>

                    <div className="p-2">
                      <Link
                        href="/profile"
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-black/70 transition-colors hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <User size={18} />
                        <span>Mi perfil</span>
                      </Link>
                    </div>

                    <div className="border-t border-black/5 p-2 dark:border-white/5">
                      <Link
                        href="/terms"
                        className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-black/60 transition-colors hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/5"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <span>Términos y Condiciones</span>
                      </Link>
                    </div>

                    <div className="border-t border-black/5 p-2 dark:border-white/5">
                      <button
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-red-500 transition-colors hover:bg-red-500/5"
                        onClick={() => logoutMutation.mutate()}
                        disabled={logoutMutation.isPending}
                      >
                        <LogOut size={18} />
                        <span>
                          {logoutMutation.isPending ? 'Cerrando sesión...' : 'Cerrar sesión'}
                        </span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      {/* Mark All Read Confirmation Modal */}
      <AnimatePresence>
        {isMarkReadModalOpen && (
          <Modal
            isOpen={isMarkReadModalOpen}
            onClose={() => setIsMarkReadModalOpen(false)}
            title="Marcar todas como leídas"
          >
            <div className="space-y-6">
              <p className="text-sm text-black/60 dark:text-white/60">
                ¿Estás seguro de que quieres marcar todas las notificaciones como leídas?
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setIsMarkReadModalOpen(false)}
                  className="flex-1 rounded-xl bg-black/5 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleMarkAllAsRead}
                  disabled={markAllAsRead.isPending}
                  className="flex-1 rounded-xl bg-black px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black"
                >
                  {markAllAsRead.isPending ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  ) : (
                    'Confirmar'
                  )}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}
