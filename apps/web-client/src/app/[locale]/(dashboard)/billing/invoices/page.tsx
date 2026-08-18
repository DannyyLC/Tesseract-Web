'use client';

import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useBillingDashboard } from '@/hooks/billing/use-billing';
import PermissionGuard from '@/components/auth/permission-guard';
import Loading from '@/app/[locale]/(dashboard)/loading';
import FiscalProfileCard from './_components/fiscal-profile-card';
import InvoiceList from './_components/invoice-list';

/**
 * Facturas y datos fiscales.
 *
 * No tiene entrada propia en el menú lateral: se llega desde la página de facturación. Es una
 * pantalla que se visita de tarde en tarde —cuando el contador pide el XML del mes— y no
 * merece competir por espacio con lo que se usa a diario.
 *
 * Los datos fiscales solo se muestran a organizaciones mexicanas. El CFDI es un documento del
 * SAT; para el resto, esta pantalla es solo el histórico de cobros.
 */
export default function InvoicesPage() {
  const t = useTranslations('Invoices');
  const { data: dashboardData, isLoading } = useBillingDashboard();

  if (isLoading) {
    return <Loading />;
  }

  const isMexican = dashboardData?.country === 'MX';

  return (
    <PermissionGuard permissions="invoice:read" redirect={true} fallbackRoute="/billing">
      <div className="space-y-8 pb-20">
        <div className="space-y-4">
          <Link
            href="/billing"
            className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft size={16} />
            {t('backToBilling')}
          </Link>

          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight text-text-primary">{t('heading')}</h1>
            <p className="max-w-xl font-medium text-text-secondary">
              {isMexican ? t('descriptionMx') : t('description')}
            </p>
          </div>
        </div>

        {isMexican && <FiscalProfileCard />}

        <div className="space-y-4">
          <h2 className="text-xl font-bold text-text-primary">{t('historyTitle')}</h2>
          <InvoiceList isMexican={isMexican} />
        </div>
      </div>
    </PermissionGuard>
  );
}
