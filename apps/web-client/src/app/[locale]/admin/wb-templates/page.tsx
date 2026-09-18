'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MessageSquareText } from 'lucide-react';
import { LogoLoader } from '@/components/ui/logo-loader';
import { InfiniteSelect } from '@/components/ui/infinite-select';
import { useDebounce } from '@/hooks/use-debounce';
import { useInfiniteAdminOrganizations } from '@/hooks/automation/use-admin-workflows';
import { useAdminWhatsappNumbers } from '@/hooks/messaging/use-admin-whatsapp-config';
import { WhatsappTemplatesAdminModal } from '@/components/admin/organizations/whatsapp-templates-admin-modal';
import type { WhatsAppConfig } from '@tesseract/types';

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
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary">{t('title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('subtitle')}</p>
      </div>

      <div className="mb-4 max-w-sm">
        <InfiniteSelect
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

      <section className="rounded-xl border border-border bg-surface">
        {!organizationId ? (
          <p className="px-4 py-10 text-center text-sm text-text-secondary">{t('selectOrgFirst')}</p>
        ) : configsLoading ? (
          <div className="flex justify-center py-16">
            <LogoLoader text={t('loading')} />
          </div>
        ) : !configs?.length ? (
          <p className="px-4 py-10 text-center text-sm text-text-secondary">{t('noNumbers')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {configs.map((config) => (
              <li
                key={config.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-text-primary">
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
                <button
                  onClick={() => setTemplatesTarget(config)}
                  className="flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
                >
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
