'use client';

import { useEffect, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { useAuth, useLogout } from '@/hooks/identity/use-auth';
import { LogoLoader } from '@/components/ui/logo-loader';
import { Cpu, Settings, ShieldCheck, LogOut, Menu, X, PanelLeftClose, PanelLeftOpen, User as UserIcon } from 'lucide-react';

const ADMIN_NAV = [
  { label: 'Modelos LLM', href: '/admin/llm-models', icon: Cpu },
  { label: 'Configuración', href: '/admin/configuracion', icon: Settings },
];

/**
 * Área de super admin: layout propio y mínimo, separado del panel de inquilino.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const logout = useLogout();
  
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    if (!isLoading && !isSuperAdmin) {
      router.replace(user ? '/dashboard' : '/login');
    }
  }, [isLoading, isSuperAdmin, user, router]);

  // Cerrar el drawer al navegar.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Cerrar menu de perfil al clickear fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (isLoading || !isSuperAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dashboard-background">
        <LogoLoader text="Verificando acceso" />
      </div>
    );
  }

  const sidebar = (
    <div className={`flex h-full flex-col border-r border-border bg-surface transition-all duration-300 ${isCollapsed ? 'w-[72px]' : 'w-[240px]'}`}>
      <div className="flex h-14 shrink-0 items-center border-b border-border px-3">
        <button
          onClick={() => {
            if (window.innerWidth < 1024) {
              setMobileOpen(false);
            } else {
              setIsCollapsed(!isCollapsed);
            }
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
          title={isCollapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {isCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
        
        {!isCollapsed && (
          <div className="ml-2 flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <ShieldCheck size={18} className="shrink-0 text-text-primary" />
            <span className="truncate text-sm font-semibold text-text-primary">
              Tesseract Admin
            </span>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {ADMIN_NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.label : undefined}
              className={`flex items-center gap-3 rounded-lg p-2 text-sm transition-colors ${
                active
                  ? 'bg-surface-secondary font-medium text-text-primary'
                  : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
              } ${isCollapsed ? 'justify-center' : ''}`}
            >
              <Icon size={18} className="shrink-0" />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Perfil de usuario al fondo */}
      <div className="relative shrink-0 border-t border-border p-3" ref={profileMenuRef}>
        <AnimatePresence>
          {showProfileMenu && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.15 }}
              className={`absolute bottom-full mb-2 rounded-xl border border-border bg-surface-elevated py-1 shadow-lg ${
                isCollapsed ? 'left-3 right-3' : 'left-3 right-3'
              }`}
            >
              <button
                onClick={() => logout.mutate()}
                className="flex w-full items-center gap-3 px-4 py-2 text-sm text-danger-600 transition-colors hover:bg-surface-secondary"
              >
                <LogOut size={16} />
                {!isCollapsed && <span>Cerrar sesión</span>}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setShowProfileMenu(!showProfileMenu)}
          className={`flex w-full items-center rounded-lg p-2 transition-colors hover:bg-surface-secondary ${
            isCollapsed ? 'justify-center' : 'gap-3'
          }`}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
            <UserIcon size={16} />
          </div>
          {!isCollapsed && (
            <div className="flex min-w-0 flex-1 flex-col text-left">
              <span className="truncate text-sm font-medium text-text-primary">
                {user?.name || 'Usuario'}
              </span>
              <span className="truncate text-xs text-text-secondary">
                {user?.email || 'admin@tesseract.com'}
              </span>
            </div>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-dashboard-background">
      {/* Sidebar fijo (desktop) */}
      <aside className={`fixed left-0 top-0 z-40 hidden h-screen transition-all duration-300 lg:block ${isCollapsed ? 'w-[72px]' : 'w-[240px]'}`}>
        {sidebar}
      </aside>

      {/* Top bar con hamburguesa (solo móvil) */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface px-4 lg:hidden">
        <button
          aria-label="Abrir menú"
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-text-primary" />
          <span className="text-sm font-semibold text-text-primary">Tesseract Admin</span>
        </div>
      </header>

      {/* Drawer móvil */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed left-0 top-0 z-50 h-screen lg:hidden"
            >
              {sidebar}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Contenido */}
      <main className={`min-h-screen pt-14 transition-all duration-300 lg:pt-0 ${isCollapsed ? 'lg:pl-[72px]' : 'lg:pl-[240px]'}`}>
        <div className="p-4 md:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
