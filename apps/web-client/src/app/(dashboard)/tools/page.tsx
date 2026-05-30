'use client';

import { useState } from 'react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Wrench, LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { MyToolsTab } from './_components/my-tools-tab';
import { CatalogTab } from './_components/catalog-tab';
import PermissionGuard from '@/components/auth/permission-guard';

type Tab = 'my-tools' | 'catalog';

export default function ToolsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Count reported up by MyToolsTab — no extra query needed here
  const [connectedCount, setConnectedCount] = useState(0);

  // Read active tab from URL — persists on refresh
  const activeTab: Tab = searchParams.get('tab') === 'catalog' ? 'catalog' : 'my-tools';

  const tabHref = (tab: Tab) => `${pathname}?tab=${tab}`;

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
          <h1 className="text-2xl font-bold text-text-primary">Tools</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Gestiona las herramientas conectadas a tu organización y explora el catálogo disponible.
          </p>
        </div>

        {/* ─── Tab switcher ───────────────────────────────────────────────── */}
        <div className="flex gap-1 rounded-2xl bg-[var(--surface-tint)] p-1 sm:w-fit">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={tabHref(tab.id)}
              replace
              scroll={false}
              className={`relative flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-surface-elevated text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-text-inverse">
                  {tab.badge}
                </span>
              )}
            </Link>
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
                onAddTool={() => router.push(tabHref('catalog'))}
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
