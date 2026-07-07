'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { useAuth, useLogout } from '@/hooks/identity/use-auth';
import { LogoLoader } from '@/components/ui/logo-loader';
import { Cpu, Settings, ShieldCheck, LogOut, Menu, X } from 'lucide-react';

const ADMIN_NAV = [
  { label: 'Modelos LLM', href: '/admin/llm-models', icon: Cpu },
  { label: 'Configuración', href: '/admin/configuracion', icon: Settings },
];

/**
 * Área de super admin: layout propio y mínimo, separado del panel de inquilino.
 * El super admin vive en la organización de plataforma (vacía), por eso NO se
 * muestran las secciones scopeadas por organización.
 *
 * El acceso real a los datos lo protege el backend (RolesGuard + SUPER_ADMIN);
 * este guard es solo de UX: redirige a quien no sea super admin.
 *
 * En pantallas pequeñas el sidebar se colapsa en un menú hamburguesa (drawer).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const logout = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);

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

  if (isLoading || !isSuperAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dashboard-background">
        <LogoLoader text="Verificando acceso" />
      </div>
    );
  }

  const sidebar = (
    <div className="flex h-full w-[240px] flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <ShieldCheck size={22} className="text-text-primary" />
        <div>
          <p className="text-sm font-semibold text-text-primary">Super Admin</p>
          <p className="text-xs text-text-secondary">Panel de plataforma</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {ADMIN_NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-surface-secondary font-medium text-text-primary'
                  : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
              }`}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-border p-3">
        <button
          onClick={() => logout.mutate()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
        >
          <LogOut size={18} />
          Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-dashboard-background">
      {/* Sidebar fijo (desktop) */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen lg:block">{sidebar}</aside>

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
          <span className="text-sm font-semibold text-text-primary">Super Admin</span>
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
              <button
                aria-label="Cerrar menú"
                onClick={() => setMobileOpen(false)}
                className="absolute right-2 top-3 z-10 rounded-lg p-1 text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
              >
                <X size={20} />
              </button>
              {sidebar}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Contenido */}
      <main className="min-h-screen pt-14 lg:pl-[240px] lg:pt-0">
        <div className="p-4 md:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
