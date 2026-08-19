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
      {/* Header: logo y, a la derecha, el control de plegado.
          Estaba en el pie ocupando una fila entera de navegación; aquí no cuesta altura. */}
      <div
        className={`flex h-16 shrink-0 items-center border-b border-border px-4 ${
          isCollapsed ? 'justify-center' : 'justify-between'
        }`}
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
            <span className="whitespace-nowrap text-lg font-bold text-text-primary">Tesseract</span>
          )}
        </Link>

        {!isCollapsed && (
          <button
            onClick={onToggle}
            className="rounded-lg p-1.5 text-text-tertiary transition-all hover:bg-surface-secondary hover:text-text-primary"
            title={t('collapse')}
            aria-label={t('collapse')}
          >
            <ChevronLeft size={18} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
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

            // Con el sidebar plegado no cabe un desplegable, así que los hijos salen en un
            // panel lateral al pasar el ratón. El `pl-2` del contenedor hace de puente: con un
            // margen quedaría un hueco sin cubrir y el panel se cerraría al cruzarlo.
            if (isCollapsed) {
              return (
                <li key={entry.key} className="group/flyout relative">
                  <div className={rowClass(hasActiveChild)} title={entry.label}>
                    <span className="flex-shrink-0">{entry.icon}</span>
                  </div>

                  <div className="invisible absolute left-full top-0 z-50 pl-2 opacity-0 transition-opacity group-hover/flyout:visible group-hover/flyout:opacity-100">
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

        {/* Plegado: en el pie solo cuando el sidebar está estrecho, porque ahí el header no
            tiene sitio para el botón. Expandido vive arriba. */}
        {isCollapsed && (
          <button
            onClick={onToggle}
            className="flex w-full items-center justify-center gap-3 rounded-xl px-3 py-2 text-text-secondary transition-all hover:bg-surface-secondary hover:text-text-primary"
            title={t('expand')}
            aria-label={t('expand')}
          >
            <ChevronLeft size={20} className="rotate-180" />
          </button>
        )}
      </div>
    </aside>
  );
}
