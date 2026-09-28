'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, ChevronRight, MessageSquareText, Phone } from 'lucide-react';
import { LogoLoader } from '@/components/ui/logo-loader';
import { InfiniteSelect } from '@/components/ui/infinite-select';
import { useDebounce } from '@/hooks/use-debounce';
import { useInfiniteAdminOrganizations } from '@/hooks/automation/use-admin-workflows';
import { useAdminWhatsappNumbers } from '@/hooks/messaging/use-admin-whatsapp-config';
import { WhatsappTemplatesAdminModal } from '@/components/admin/organizations/whatsapp-templates-admin-modal';
import type { WhatsAppConfig } from '@tesseract/types';
import {
  filterSelectClass,
  labelClass,
  pageSubtitleClass,
  pageTitleClass,
  rowActionClass,
  rowClass,
} from '../_styles';

const CONNECTION_STYLE: Record<string, string> = {
  CONNECTED: 'text-success-600',
  ERROR: 'text-danger',
  DISCONNECTED: 'text-warning-600',
  PENDING: 'text-text-tertiary',
};

/**
 * Templates de WhatsApp de cualquier organización. Meta los registra por número
 * (WABA), no por organización ni por workflow, así que hay que elegir primero la
 * organización y luego el número — el CRUD en sí reutiliza el mismo modal que ya
 * usa la pestaña "Canales" del detalle de organización.
 */
export default function AdminWbTemplatesPage() {
  const t = useTranslations('Admin.WbTemplates');
  const [organizationId, setOrganizationId] = useState('');
  const [orgSearchInput, setOrgSearchInput] = useState('');
  const [templatesTarget, setTemplatesTarget] = useState<WhatsAppConfig | null>(null);

  const orgSearch = useDebounce(orgSearchInput, 400);

  const {
    data: orgPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: orgsLoading,
  } = useInfiniteAdminOrganizations({ search: orgSearch || undefined });

  const organizations = useMemo(() => orgPages?.pages.flatMap((p) => p.data) ?? [], [orgPages]);
  const orgOptions = useMemo(
    () => organizations.map((o) => ({ label: o.name, value: o.id })),
    [organizations],
  );

  const { data: configs, isLoading: configsLoading } = useAdminWhatsappNumbers(organizationId);

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className={pageTitleClass}>{t('title')}</h1>
        <p className={pageSubtitleClass}>{t('subtitle')}</p>
      </div>

      <div className="max-w-sm">
        <label className={labelClass}>{t('orgLabel')}</label>
        <InfiniteSelect
          triggerClassName={filterSelectClass}
          value={organizationId}
          onChange={setOrganizationId}
          options={orgOptions}
          placeholder={t('selectOrgPlaceholder')}
          isLoading={orgsLoading}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={fetchNextPage}
          searchValue={orgSearchInput}
          onSearchChange={setOrgSearchInput}
          searchPlaceholder={t('orgSearchPlaceholder')}
        />
      </div>

      <section>
        {!organizationId ? (
          <EmptyState icon={Building2} title={t('selectOrgTitle')} body={t('selectOrgFirst')}>
            {/* El recorrido completo, con el paso en el que se está resaltado: deja claro que
                la lista depende de la organización y qué viene después. */}
            <ol className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs font-medium">
              {[
                { icon: Building2, label: t('stepOrg') },
                { icon: Phone, label: t('stepNumber') },
                { icon: MessageSquareText, label: t('stepTemplates') },
              ].map(({ icon: Icon, label }, index) => (
                <li key={label} className="flex items-center gap-2">
                  {index > 0 && <ChevronRight size={14} className="text-text-tertiary" />}
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ${
                      index === 0
                        ? 'bg-accent text-text-inverse'
                        : 'bg-[var(--surface-tint)] text-text-tertiary'
                    }`}
                  >
                    <span className="tabular-nums">{index + 1}</span>
                    <Icon size={13} />
                    {label}
                  </span>
                </li>
              ))}
            </ol>
          </EmptyState>
        ) : configsLoading ? (
          <div className="flex justify-center py-16">
            <LogoLoader text={t('loading')} />
          </div>
        ) : !configs?.length ? (
          <EmptyState icon={Phone} title={t('noNumbersTitle')} body={t('noNumbers')} />
        ) : (
          <ul className="space-y-1">
            {configs.map((config) => (
              <li
                key={config.id}
                className={`${rowClass} flex flex-wrap items-center justify-between gap-3 px-4 py-3.5`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-text-primary">
                      {config.displayName || config.phoneNumber}
                    </span>
                    {config.displayName && (
                      <span className="text-xs text-text-secondary">{config.phoneNumber}</span>
                    )}
                    {!config.isActive && (
                      <span className="text-xs text-danger">{t('inactiveBadge')}</span>
                    )}
                  </div>
                  <span
                    className={`text-xs ${CONNECTION_STYLE[config.connectionStatus] ?? 'text-text-tertiary'}`}
                  >
                    {config.connectionStatus}
                  </span>
                </div>
                <button onClick={() => setTemplatesTarget(config)} className={rowActionClass}>
                  <MessageSquareText size={14} />
                  {t('templatesButton')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {templatesTarget && (
        <WhatsappTemplatesAdminModal
          isOpen={!!templatesTarget}
          onClose={() => setTemplatesTarget(null)}
          organizationId={organizationId}
          configId={templatesTarget.id}
          configLabel={templatesTarget.displayName || templatesTarget.phoneNumber}
        />
      )}
    </div>
  );
}

/** Estado vacío con icono, como los de Catálogos y Contactos del panel de usuario. */
function EmptyState({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: typeof Building2;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-4 py-16 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-tint)]">
        <Icon size={24} className="text-text-tertiary" />
      </div>
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-text-secondary">{body}</p>
      {children}
    </div>
  );
}
