'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { ROLE_PERMISSIONS } from '@tesseract/types';
import {
  LayoutDashboard,
  Workflow,
  Wrench,
  Coins,
  Settings,
  Users,
  Activity,
  HelpCircle,
  ChevronLeft,
  MessageSquare,
  Key,
} from 'lucide-react';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}
interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}
interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'PLATAFORMA',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={20} /> },
      { label: 'Workflows', href: '/workflows', icon: <Workflow size={20} /> },
      { label: 'Tools', href: '/tools', icon: <Wrench size={20} /> },
      { label: 'Executions', href: '/executions', icon: <Activity size={20} /> },
      { label: 'Conversations', href: '/conversations', icon: <MessageSquare size={20} /> },
    ],
  },
  {
    title: 'ADMINISTRACIÓN',
    items: [
      { label: 'Miembros', href: '/users', icon: <Users size={20} /> },
      { label: 'API Keys', href: '/api-keys', icon: <Key size={20} /> },
      { label: 'Facturación', href: '/billing', icon: <Coins size={20} /> },
      { label: 'Configuración', href: '/settings', icon: <Settings size={20} /> },
    ],
  },
];

export default function Sidebar({ isCollapsed, onToggle, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  const { data: user } = useAuth();
  const role = user?.role || 'VIEWER';
  const userPermissions = ROLE_PERMISSIONS[role] || [];

  const isActiveRoute = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard' || pathname === '/';
    }
    return pathname.startsWith(href);
  };

  const filteredNavSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.href === '/billing') {
          return userPermissions.includes('billing:read');
        }
        if (item.href === '/settings') {
          return userPermissions.includes('organization:delete');
        }
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-black/5 bg-white transition-all duration-300 dark:border-white/5 dark:bg-[#0A0A0A] ${
        isCollapsed ? 'w-20' : 'w-[280px] lg:w-[260px]'
      }`}
    >
      {/* Header */}
      <div
        className={`flex h-16 shrink-0 items-center border-b border-black/5 px-4 dark:border-white/5 ${isCollapsed ? 'justify-center' : 'justify-start'}`}
      >
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-3 overflow-hidden"
        >
          <div className="relative h-9 w-9 flex-shrink-0">
            <Image
              src="/favicon.svg"
              alt="Tesseract"
              fill
              loading="eager"
              className="object-contain brightness-0 dark:invert"
            />
          </div>
          {!isCollapsed && (
            <span className="whitespace-nowrap text-lg font-bold text-black dark:text-white">
              Tesseract
            </span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {filteredNavSections.map((section, sectionIndex) => (
          <div key={section.title} className={sectionIndex > 0 ? 'mt-6' : ''}>
            {!isCollapsed && (
              <p className="mb-2 px-3 text-xs font-semibold tracking-wider text-black/30 dark:text-white/30">
                {section.title}
              </p>
            )}

            <ul className="space-y-1">
              {section.items.map((item) => {
                const isActive = isActiveRoute(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                        isActive
                          ? 'bg-black text-white dark:bg-white dark:text-black'
                          : 'text-black/60 hover:bg-black/5 hover:text-black dark:text-white/60 dark:hover:bg-white/5 dark:hover:text-white'
                      } ${isCollapsed ? 'justify-center' : ''}`}
                      title={isCollapsed ? item.label : undefined}
                    >
                      <span className="flex-shrink-0">{item.icon}</span>
                      {!isCollapsed && (
                        <span className="overflow-hidden whitespace-nowrap font-medium">
                          {item.label}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="space-y-1 border-t border-black/5 p-2 dark:border-white/5">
        <Link
          href="/support"
          onClick={onNavigate}
          className={`flex items-center gap-3 rounded-xl px-3 py-2 text-black/50 transition-all hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title={isCollapsed ? 'Soporte' : undefined}
        >
          <HelpCircle size={20} />
          {!isCollapsed && <span className="font-medium">Soporte</span>}
        </Link>

        <button
          onClick={onToggle}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-black/50 transition-all hover:bg-black/5 hover:text-black dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title={isCollapsed ? 'Expandir' : 'Colapsar'}
        >
          <ChevronLeft
            size={20}
            className={`transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}
          />
          {!isCollapsed && <span className="font-medium">Colapsar</span>}
        </button>
      </div>
    </aside>
  );
}
