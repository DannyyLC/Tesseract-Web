'use client';

import { Suspense, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { Building2, CreditCard, Database, Radio, Receipt, SlidersHorizontal } from 'lucide-react';
import { LogoLoader } from '@/components/ui/logo-loader';
import { useAdminOrganization } from '@/hooks/identity/use-admin-organizations';
import { GeneralTab } from '@/components/admin/organizations/general-tab';
import { CreditsTab } from '@/components/admin/organizations/credits-tab';
import { SubscriptionTab } from '@/components/admin/organizations/subscription-tab';
import { LimitsTab } from '@/components/admin/organizations/limits-tab';
import { ChannelsTab } from '@/components/admin/organizations/channels-tab';
import { CatalogsTab } from '@/components/admin/organizations/catalogs/catalogs-tab';
import { stickyHeaderClass, tabItemClass, tabsTrackClass } from '../../_styles';

type TabId = 'general' | 'credits' | 'subscription' | 'limits' | 'channels' | 'catalogs';

/**
 * `useSearchParams` obliga a Next a tener un límite de Suspense para poder
 * prerenderizar; sin él, el build falla al exportar la ruta.
 */
export default function AdminOrganizationDetailPage() {
  const t = useTranslations('Admin.OrganizationDetail');
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <LogoLoader text={t('loading')} />
        </div>
      }
    >
      <OrganizationDetail />
    </Suspense>
  );
}

function OrganizationDetail() {
  const t = useTranslations('Admin.OrganizationDetail');
  const TABS: { id: TabId; label: string; icon: typeof Building2 }[] = [
    { id: 'general', label: t('tabs.general'), icon: Building2 },
    { id: 'credits', label: t('tabs.credits'), icon: CreditCard },
    { id: 'subscription', label: t('tabs.subscription'), icon: Receipt },
    { id: 'limits', label: t('tabs.limits'), icon: SlidersHorizontal },
    { id: 'channels', label: t('tabs.channels'), icon: Radio },
    { id: 'catalogs', label: t('tabs.catalogs'), icon: Database },
  ];
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const organizationId = String(params.id);

  const { data: org, isLoading, error } = useAdminOrganization(organizationId);

  // Tab activa en la URL (?tab=…), no en useState: sobrevive a refresh y respeta
  // atrás/adelante del navegador (mismo patrón que admin/workflows/[id]).
  const tabParam = searchParams.get('tab');
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : 'general';

  const setTab = useCallback(
    (next: TabId) => {
      const query = new URLSearchParams(searchParams.toString());
      query.set('tab', next);
      router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  if (isLoading || !org) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        {error ? (
          <p className="text-sm text-danger">{t('loadError')}</p>
        ) : (
          <LogoLoader text={t('loading')} />
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className={stickyHeaderClass}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-4 md:px-6 lg:px-8">
          <h1 className="text-xl font-bold text-text-primary">{org.name}</h1>
          <p className="flex flex-wrap items-center gap-x-3 text-sm text-text-secondary">
            <span>{org.slug}</span>
            <span>{org.plan}</span>
            {!org.isActive && <span className="text-danger">{t('inactiveBadge')}</span>}
          </p>
        </div>

        <div className="px-4 pb-3 pt-3 md:px-6 lg:px-8">
          <nav className={tabsTrackClass}>
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={tabItemClass(tab === id)}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {tab === 'general' && <GeneralTab org={org} />}
      {tab === 'credits' && <CreditsTab organizationId={organizationId} org={org} />}
      {tab === 'subscription' && <SubscriptionTab org={org} />}
      {tab === 'limits' && <LimitsTab org={org} />}
      {tab === 'channels' && <ChannelsTab organizationId={organizationId} />}
      {tab === 'catalogs' && <CatalogsTab organizationId={organizationId} />}
    </div>
  );
}
