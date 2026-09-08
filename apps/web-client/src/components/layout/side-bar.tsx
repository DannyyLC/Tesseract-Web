'use client';

import { useState } from 'react';
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
  ChevronDown,
  MessageSquare,
  Database,
  Contact,
  Building2,
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
  /** Permiso necesario para verlo. Sin él, la fila es visible para cualquier rol. */
  permission?: string;
}

/**
 * Grupo plegable.
 *
 * No tiene `href` a propósito: es un contenedor, no un destino. Pulsarlo abre y cierra, nada
 * más. Darle página propia obligaría a inventar un resumen de administración que nadie pidió.
 */
interface NavGroup {
  key: string;
  label: string;
  icon: React.ReactNode;
  items: NavItem[];
}

type NavEntry = NavItem | NavGroup;

const isGroup = (entry: NavEntry): entry is NavGroup => 'items' in entry;

export default function Sidebar({ isCollapsed, onToggle, onNavigate }: SidebarProps) {
  const t = useTranslations('DashboardNav');
  const pathname = usePathname();
  const { data: user } = useAuth();

  /**
   * Grupos que el usuario ha abierto o cerrado a mano.
   *
   * Lo que no está aquí cae al valor por defecto: abierto solo si estás dentro de una de sus
   * rutas. Es lo que hace que el grupo no gaste altura mientras no lo necesitas, que era todo
   * el motivo de agruparlo — un acordeón siempre abierto ocupa lo mismo que las filas sueltas
   * más su propia cabecera.
   */
  const [toggledGroups, setToggledGroups] = useState<Record<string, boolean>>({});

  const navEntries: NavEntry[] = [
    { label: t('navDashboard'), href: '/dashboard', icon: <LayoutDashboard size={20} /> },
    { label: t('navWorkflows'), href: '/workflows', icon: <Workflow size={20} /> },
    { label: t('navIntegrations'), href: '/integrations', icon: <Blocks size={20} /> },
    { label: t('navDatasets'), href: '/datasets', icon: <Database size={20} /> },
    { label: t('navConversations'), href: '/conversations', icon: <MessageSquare size={20} /> },
    { label: t('navContacts'), href: '/contacts', icon: <Contact size={20} /> },
    {
      key: 'organization',
      label: t('navOrganization'),
      icon: <Building2 size={20} />,
      items: [
        { label: t('navMembers'), href: '/users', icon: <Users size={20} /> },
        // `/api-keys` no aparece en la navegación a propósito. Es el concepto más técnico del
        // producto y confunde a quien no programa; además su única función propia —verlas todas
        // juntas— se acaba usando filtrando por workflow, que es justo lo que hace la sección
        // del detalle del workflow. La ruta sigue viva y accesible escribiendo la URL.
        { label: t('navBilling'), href: '/billing', icon: <Coins size={20} />, permission: 'billing:read' },
        {
          label: t('navSettings'),
          href: '/settings',
          icon: <Settings size={20} />,
          permission: 'organization:delete',
        },
      ],
    },
  ];

  const role = user?.role || 'VIEWER';
  const userPermissions: string[] = ROLE_PERMISSIONS[role] || [];

  const isActiveRoute = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard' || pathname === '/';
    }
    return pathname.startsWith(href);
  };

  const canSee = (item: NavItem) =>
    !item.permission || userPermissions.includes(item.permission);

  const visibleEntries = navEntries
    .map((entry) => (isGroup(entry) ? { ...entry, items: entry.items.filter(canSee) } : entry))
    .filter((entry) => (isGroup(entry) ? entry.items.length > 0 : canSee(entry)));

  const groupHasActiveRoute = (group: NavGroup) => group.items.some((i) => isActiveRoute(i.href));

  const isGroupOpen = (group: NavGroup) =>
    group.key in toggledGroups ? toggledGroups[group.key] : groupHasActiveRoute(group);

  const toggleGroup = (group: NavGroup) =>
    setToggledGroups((prev) => ({ ...prev, [group.key]: !isGroupOpen(group) }));

  const rowClass = (active: boolean) =>
    `group relative flex items-center gap-3 rounded-xl px-3 py-2 transition-all ${
      active
        ? 'bg-accent text-text-inverse'
        : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
    } ${isCollapsed ? 'justify-center' : ''}`;

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-surface transition-all duration-300 ${
        isCollapsed ? 'w-20' : 'w-[280px] lg:w-[260px]'
      }`}
    >
      {/* Header: logo y, a la derecha, el control de plegado. Vive siempre aquí, plegado o no
          — antes se iba al pie cuando el sidebar estaba angosto, y ahí quedaba escondido bajo
          el resto de la navegación en vez de a mano apenas se necesita. */}
      <div
        className={`flex h-16 shrink-0 items-center justify-between border-b border-border ${
          isCollapsed ? 'px-2' : 'px-4'
        }`}
      >
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-3 overflow-hidden"
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
            <span className="whitespace-nowrap text-lg font-bold text-text-primary">Tesseract</span>
          )}
        </Link>

        <button
          onClick={onToggle}
          className={`flex-shrink-0 rounded-lg text-text-tertiary transition-all hover:bg-surface-secondary hover:text-text-primary ${
            isCollapsed ? 'p-1' : 'p-1.5'
          }`}
          title={isCollapsed ? t('expand') : t('collapse')}
          aria-label={isCollapsed ? t('expand') : t('collapse')}
        >
          <ChevronLeft size={isCollapsed ? 16 : 18} className={isCollapsed ? 'rotate-180' : ''} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
        <ul className="space-y-1">
          {visibleEntries.map((entry) => {
            if (!isGroup(entry)) {
              const active = isActiveRoute(entry.href);
              return (
                <li key={entry.href}>
                  <Link
                    href={entry.href}
                    onClick={onNavigate}
                    className={rowClass(active)}
                    title={isCollapsed ? entry.label : undefined}
                  >
                    <span className="flex-shrink-0">{entry.icon}</span>
                    {!isCollapsed && (
                      <span className="overflow-hidden whitespace-nowrap font-medium">
                        {entry.label}
                      </span>
                    )}
                  </Link>
                </li>
              );
            }

            const hasActiveChild = groupHasActiveRoute(entry);
            const open = isGroupOpen(entry);

            // Con el sidebar plegado el panel lateral solo aparece al pasar el ratón — en
            // touch/trackpad no hay hover, así que el grupo parecía muerto al hacer click. El
            // click ahora expande el sidebar entero y abre el grupo, en vez de depender de un
            // flyout que nunca se ve si nadie pasa el mouse por encima.
            if (isCollapsed) {
              return (
                <li key={entry.key} className="group/flyout relative">
                  <button
                    type="button"
                    onClick={() => {
                      onToggle();
                      setToggledGroups((prev) => ({ ...prev, [entry.key]: true }));
                    }}
                    aria-expanded={open}
                    className={`w-full ${rowClass(hasActiveChild)}`}
                    title={entry.label}
                  >
                    <span className="flex-shrink-0">{entry.icon}</span>
                  </button>

                  <div
                    className={`invisible absolute left-full top-0 z-50 pl-2 opacity-0 transition-opacity group-hover/flyout:visible group-hover/flyout:opacity-100`}
                  >
                    <ul className="min-w-[190px] space-y-1 rounded-xl border border-border bg-surface p-2 shadow-lg">
                      {entry.items.map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={onNavigate}
                            className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                              isActiveRoute(item.href)
                                ? 'bg-accent text-text-inverse'
                                : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
                            }`}
                          >
                            <span className="flex-shrink-0">{item.icon}</span>
                            <span className="whitespace-nowrap font-medium">{item.label}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              );
            }

            return (
              <li key={entry.key}>
                <button
                  onClick={() => toggleGroup(entry)}
                  // El grupo se resalta cuando estás dentro de alguna de sus rutas aunque esté
                  // cerrado: si no, al cerrarlo desde `/billing` perderías toda referencia de
                  // dónde estás parado.
                  className={`${rowClass(false)} w-full ${
                    hasActiveChild && !open ? 'text-text-primary' : ''
                  }`}
                  aria-expanded={open}
                >
                  <span className="flex-shrink-0">{entry.icon}</span>
                  <span className="flex-1 overflow-hidden whitespace-nowrap text-left font-medium">
                    {entry.label}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`flex-shrink-0 transition-transform duration-200 ${
                      open ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {open && (
                  // La guía vertical sustituye a la cabecera de sección que había antes: dice
                  // lo mismo —"esto cuelga de aquí"— sin gastar una fila.
                  <ul className="ml-5 mt-1 space-y-1 border-l border-border pl-2">
                    {entry.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          className={rowClass(isActiveRoute(item.href))}
                        >
                          <span className="flex-shrink-0">{item.icon}</span>
                          <span className="overflow-hidden whitespace-nowrap font-medium">
                            {item.label}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
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
      </div>
    </aside>
  );
}
