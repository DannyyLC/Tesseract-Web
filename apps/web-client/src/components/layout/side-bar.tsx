'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { usePathname, Link } from '@/i18n/routing';
import { useAuth } from '@/hooks/identity/use-auth';
import { ROLE_PERMISSIONS } from '@tesseract/types';
import {
  LayoutDashboard,
  Workflow,
  Blocks,
  Coins,
  Settings,
  Users,
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


export default function Sidebar({ isCollapsed, onToggle, onNavigate }: SidebarProps) {
  const t = useTranslations('DashboardNav');
  const pathname = usePathname();

  const navSections: NavSection[] = [
    {
      title: t('sectionPlatform'),
      items: [
        { label: t('navDashboard'), href: '/dashboard', icon: <LayoutDashboard size={20} /> },
        { label: t('navWorkflows'), href: '/workflows', icon: <Workflow size={20} /> },
        { label: t('navIntegrations'), href: '/integrations', icon: <Blocks size={20} /> },
        { label: t('navConversations'), href: '/conversations', icon: <MessageSquare size={20} /> },
      ],
    },
    {
      title: t('sectionAdmin'),
      items: [
        { label: t('navMembers'), href: '/users', icon: <Users size={20} /> },
        { label: t('navApiKeys'), href: '/api-keys', icon: <Key size={20} /> },
        { label: t('navBilling'), href: '/billing', icon: <Coins size={20} /> },
        { label: t('navSettings'), href: '/settings', icon: <Settings size={20} /> },
      ],
    },
  ];

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
      className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-surface transition-all duration-300 ${
        isCollapsed ? 'w-20' : 'w-[280px] lg:w-[260px]'
      }`}
    >
      {/* Header */}
      <div
        className={`flex h-16 shrink-0 items-center border-b border-border px-4 ${isCollapsed ? 'justify-center' : 'justify-start'}`}
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
              className="object-contain [filter:var(--logo-filter)]"
            />
          </div>
          {!isCollapsed && (
            <span className="whitespace-nowrap text-lg font-bold text-text-primary">
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
              <p className="mb-2 px-3 text-xs font-semibold tracking-wider text-text-tertiary">
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
                          ? 'bg-accent text-text-inverse'
                          : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
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
      <div className="space-y-1 border-t border-border p-2">
        <Link
          href="/support"
          onClick={onNavigate}
          className={`flex items-center gap-3 rounded-xl px-3 py-2 text-text-secondary transition-all hover:bg-surface-secondary hover:text-text-primary ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title={isCollapsed ? t('navSupport') : undefined}
        >
          <HelpCircle size={20} />
          {!isCollapsed && <span className="font-medium">{t('navSupport')}</span>}
        </Link>

        <button
          onClick={onToggle}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-text-secondary transition-all hover:bg-surface-secondary hover:text-text-primary ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title={isCollapsed ? t('expand') : t('collapse')}
        >
          <ChevronLeft
            size={20}
            className={`transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}
          />
          {!isCollapsed && <span className="font-medium">{t('collapse')}</span>}
        </button>
      </div>
    </aside>
  );
}
