'use client';

import { useCallback, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Wrench, LayoutGrid } from 'lucide-react';
import { MyToolsTab } from './_components/my-tools-tab';
import { CatalogTab } from './_components/catalog-tab';
import PermissionGuard from '@/components/auth/PermissionGuard';

type Tab = 'my-tools' | 'catalog';

export default function ToolsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Count reported up by MyToolsTab — no extra query needed here
  const [connectedCount, setConnectedCount] = useState(0);

  // Read active tab from URL — persists on refresh
  const activeTab: Tab = searchParams.get('tab') === 'catalog' ? 'catalog' : 'my-tools';

  const setActiveTab = useCallback(
    (tab: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', tab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      id: 'my-tools',
      label: 'Mis Tools',
      icon: <Wrench size={16} />,
      badge: connectedCount,
    },
    {
      id: 'catalog',
      label: 'Catálogo',
      icon: <LayoutGrid size={16} />,
    },
  ];

  return (
    <PermissionGuard permissions="tenant_tools:read" redirect={true} fallbackRoute="/dashboard">
      <div className="space-y-8">
        {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-black dark:text-white">Tools</h1>
        <p className="mt-1 text-sm text-black/50 dark:text-white/50">
          Gestiona las herramientas conectadas a tu organización y explora el catálogo disponible.
        </p>
      </div>

      {/* ─── Tab switcher ───────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-2xl bg-black/[0.04] p-1 sm:w-fit dark:bg-white/[0.04]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-black shadow-sm dark:bg-white/10 dark:text-white'
                : 'text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-black px-1.5 text-[10px] font-bold text-white dark:bg-white dark:text-black">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Tab content ────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {activeTab === 'my-tools' ? (
            <MyToolsTab
              onAddTool={() => setActiveTab('catalog')}
              onCountChange={setConnectedCount}
            />
          ) : (
            <CatalogTab />
          )}
        </motion.div>
      </AnimatePresence>
      </div>
    </PermissionGuard>
  );
}
