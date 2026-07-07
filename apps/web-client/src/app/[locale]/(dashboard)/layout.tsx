'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from '@/i18n/routing';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from '@/components/layout/side-bar';
import TopBar from '@/components/layout/top-bar';
import Loading from './loading';
import { Suspense } from 'react';
import { WelcomeOnboarding } from '@/components/ui/welcome-onboarding';
import { useAuth } from '@/hooks/identity/use-auth';
import { LogoLoader } from '@/components/ui/logo-loader';

interface PanelLayoutProps {
  children: React.ReactNode;
}

export default function PanelLayout({ children }: PanelLayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // El super admin es operador de plataforma: no pertenece al panel de
  // inquilino (scopeado por organización). Si cae aquí por cualquier vía
  // (navegación directa, refresh, redirect raíz), lo mandamos a /admin.
  const { data: user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    if (isSuperAdmin) {
      router.replace('/admin');
    }
  }, [isSuperAdmin, router]);

  // Detectar si estamos en una página de detalle de conversación o workflow chat
  // Lógica: empieza con /conversations/ o /workflows/ y tiene caracteres después (el ID)
  const isFullWidthPage =
    (pathname.startsWith('/conversations/') && pathname.length > '/conversations/'.length) ||
    (pathname.startsWith('/workflows/') && pathname.length > '/workflows/'.length);

  useEffect(() => {
    setMounted(true);
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState !== null) {
      setIsSidebarCollapsed(JSON.parse(savedState));
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem('sidebarCollapsed', JSON.stringify(isSidebarCollapsed));
    }
  }, [isSidebarCollapsed, mounted]);

  const handleSidebarToggle = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  const handleMobileMenuClick = () => {
    setIsMobileSidebarOpen(!isMobileSidebarOpen);
  };

  // Mientras redirigimos al super admin, no montamos el panel de inquilino
  // (evita las llamadas org-scoped que devuelven 403).
  if (isSuperAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dashboard-background">
        <LogoLoader text="Redirigiendo a Super Admin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dashboard-background">
      <Suspense fallback={null}>
        <WelcomeOnboarding />
      </Suspense>

      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar isCollapsed={isSidebarCollapsed} onToggle={handleSidebarToggle} />
      </div>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobileSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-overlay fixed inset-0 z-40 backdrop-blur-sm lg:hidden"
              onClick={() => setIsMobileSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed left-0 top-0 z-50 h-screen lg:hidden"
            >
              <Sidebar
                isCollapsed={false}
                onToggle={() => setIsMobileSidebarOpen(false)}
                onNavigate={() => setIsMobileSidebarOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Top Bar */}
      <TopBar onMenuClick={handleMobileMenuClick} isSidebarCollapsed={isSidebarCollapsed} />

      {/* Main Content */}
      <main
        className={`transition-all duration-300 ${
          isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-[260px]'
        } ${
          isFullWidthPage
            ? 'flex h-screen flex-col overflow-hidden pt-16'
            : 'min-h-screen pb-24 pt-16 lg:pb-8'
        }`}
      >
        <div className={isFullWidthPage ? 'h-full w-full' : 'p-4 md:p-6 lg:p-8'}>
          {mounted ? children : <Loading />}
        </div>
      </main>
    </div>
  );
}
