'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, Link } from '@/i18n/routing';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, Bell, ChevronRight, LogOut, User, CheckCheck, Loader2 } from 'lucide-react';
import { useAuth, useLogout } from '@/hooks/identity/use-auth';
import { useUnreadNotificationsCount, useNotificationMutations } from '@/hooks/messaging/use-notifications';
import NotificationList from '../notifications/notification-list';
import { Modal } from '@/components/ui/modal';

interface TopBarProps {
  onMenuClick: () => void;
  isSidebarCollapsed: boolean;
}


export default function TopBar({ onMenuClick, isSidebarCollapsed }: TopBarProps) {
  const t = useTranslations('DashboardNav');
  const pathname = usePathname();

  const routeNames: Record<string, string> = {
    dashboard: t('routeDashboard'),
    workflows: t('routeWorkflows'),
    executions: t('routeExecutions'),
    credits: t('routeCredits'),
    users: t('routeMembers'),
    settings: t('routeSettings'),
    conversations: t('routeConversations'),
    'api-keys': t('routeApiKeys'),
  };
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
    name: authUser?.name || t('userFallbackName'),
    email: authUser?.email || '',
    role: authUser?.role || t('userFallbackRole'),
    avatar: null,
    organization: authUser?.organizationName || t('userFallbackOrg'),
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
        className={`fixed left-0 right-0 top-0 z-30 h-16 border-b border-border bg-surface/80 backdrop-blur-xl transition-all duration-300 ${
          isSidebarCollapsed ? 'lg:left-20' : 'lg:left-[260px]'
        }`}
      >
        <div className="flex h-full items-center justify-between px-4 md:px-6">
          {/* Left Section */}
          <div className="flex items-center gap-4">
            <button
              onClick={onMenuClick}
              className="rounded-lg p-2 transition-colors hover:bg-surface-secondary lg:hidden"
            >
              <Menu size={20} className="text-text-primary" />
            </button>

            <nav className="hidden items-center gap-2 text-sm md:flex">
              {breadcrumbs.map((crumb, index) => (
                <div key={crumb.href} className="flex items-center gap-2">
                  {index > 0 && (
                    <ChevronRight size={14} className="text-text-tertiary" />
                  )}
                  <Link
                    href={crumb.href}
                    className={`transition-colors ${
                      index === breadcrumbs.length - 1
                        ? 'font-medium text-text-primary'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {crumb.label}
                  </Link>
                </div>
              ))}
            </nav>

            <h1 className="text-lg font-semibold text-text-primary md:hidden">
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
                className="relative rounded-lg p-2 transition-colors hover:bg-surface-secondary"
              >
                <Bell size={20} className="text-text-secondary" />
                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-text-inverse shadow-sm ring-2 ring-surface">
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
                    className="absolute right-0 top-full mt-2 w-80 overflow-hidden rounded-2xl border border-border bg-surface shadow-md sm:w-96"
                  >
                    <div className="flex items-center justify-between border-b border-border p-4">
                      <h3 className="font-semibold text-text-primary">{t('notifications')}</h3>
                      {unreadCount > 0 && (
                        <button
                          onClick={() => setIsMarkReadModalOpen(true)}
                          disabled={markAllAsRead.isPending}
                          className="flex items-center gap-1 text-xs font-medium text-info hover:text-info-600 disabled:opacity-50"
                        >
                          {markAllAsRead.isPending ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <CheckCheck size={12} />
                          )}
                          {t('markRead')}
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
                className="flex items-center gap-2 rounded-xl p-1 pr-2 transition-colors hover:bg-surface-secondary"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent">
                  <span className="text-sm font-semibold text-text-inverse">
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
                    className="absolute right-0 top-full mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-surface shadow-md"
                  >
                    <div className="border-b border-border p-4">
                      <div className="mb-0.5 flex items-center gap-2">
                        <p className="font-semibold text-text-primary">{user.name}</p>
                        <span className="rounded-md border border-border bg-surface-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-secondary">
                          {user.role}
                        </span>
                      </div>
                      <p
                        className="truncate text-sm text-text-secondary"
                        title={user.email}
                      >
                        {user.email}
                      </p>
                      <p className="mt-1 text-xs text-text-tertiary">
                        {user.organization}
                      </p>
                    </div>

                    <div className="p-2">
                      <Link
                        href="/profile"
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <User size={18} />
                        <span>{t('myProfile')}</span>
                      </Link>
                    </div>

                    <div className="border-t border-border p-2">
                      <Link
                        href="/terms"
                        className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <span>{t('termsAndConditions')}</span>
                      </Link>
                    </div>

                    <div className="border-t border-border p-2">
                      <button
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-danger-500 transition-colors hover:bg-[color-mix(in_srgb,var(--danger-500)_12%,transparent)] hover:text-danger-600 disabled:opacity-50"
                        onClick={() => logoutMutation.mutate()}
                        disabled={logoutMutation.isPending}
                      >
                        <LogOut size={18} />
                        <span>
                          {logoutMutation.isPending ? t('loggingOut') : t('logout')}
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
            title={t('markAllReadTitle')}
          >
            <div className="space-y-6">
              <p className="text-sm text-text-secondary">
                {t('markAllReadConfirm')}
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setIsMarkReadModalOpen(false)}
                  className="flex-1 rounded-xl bg-surface-secondary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-elevated"
                >
                  {t('cancelButton')}
                </button>
                <button
                  onClick={handleMarkAllAsRead}
                  disabled={markAllAsRead.isPending}
                  className="flex-1 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {markAllAsRead.isPending ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  ) : (
                    t('confirmButton')
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
