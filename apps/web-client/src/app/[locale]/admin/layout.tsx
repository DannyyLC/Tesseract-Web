'use client';

import { useEffect } from 'react';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { useAuth, useLogout } from '@/hooks/identity/use-auth';
import { LogoLoader } from '@/components/ui/logo-loader';
import { Cpu, ShieldCheck, LogOut } from 'lucide-react';

const ADMIN_NAV = [{ label: 'Modelos LLM', href: '/admin/llm-models', icon: Cpu }];

/**
 * Área de super admin: layout propio y mínimo, separado del panel de inquilino.
 * El super admin vive en la organización de plataforma (vacía), por eso NO se
 * muestran las secciones scopeadas por organización.
 *
 * El acceso real a los datos lo protege el backend (RolesGuard + SUPER_ADMIN);
 * este guard es solo de UX: redirige a quien no sea super admin.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const logout = useLogout();

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    if (!isLoading && !isSuperAdmin) {
      router.replace(user ? '/dashboard' : '/login');
    }
  }, [isLoading, isSuperAdmin, user, router]);

  if (isLoading || !isSuperAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dashboard-background">
        <LogoLoader text="Verificando acceso" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dashboard-background">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[240px] flex-col border-r border-border bg-surface lg:flex">
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
      </aside>

      {/* Contenido */}
      <main className="min-h-screen lg:pl-[240px]">
        <div className="p-4 md:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
