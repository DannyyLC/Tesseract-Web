'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AlertTriangle, Clock, Download, Loader2, RefreshCw } from 'lucide-react';
import { DashboardInvoiceDto } from '@tesseract/types';
import { useInvoices, useInvoiceMutations } from '@/hooks/billing/use-invoices';
import { CursorPager } from '@/components/ui/cursor-pager';
import { usePageSize } from '@/hooks/shared/use-page-size';

/**
 * Histórico de facturas con el estado de su CFDI.
 *
 * El estado del CFDI se traduce a tres situaciones muy distintas para el cliente, y la
 * diferencia importa:
 *
 * - **Timbrada**: descarga el XML (el documento fiscal) y el PDF (su representación).
 * - **Faltan sus datos**: puede arreglarlo él, así que se le pide corregir y se le da el botón.
 * - **Problema nuestro**: no puede hacer nada. Se le informa y **no** se le ofrece un botón,
 *   porque pulsarlo fallaría igual y sugiere que la pelota está en su tejado cuando no lo está.
 */
export default function InvoiceList({ isMexican }: { isMexican: boolean }) {
  const t = useTranslations('Invoices');
  const [cursor, setCursor] = useState<string | null>(null);
  const [action, setAction] = useState<'next' | 'prev' | null>(null);
  const { pageSize, setPageSize } = usePageSize('invoices');

  const { data, isLoading } = useInvoices(cursor, action, pageSize);
  const { generateCfdi, downloadCfdi } = useInvoiceMutations();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = async (invoice: DashboardInvoiceDto, format: 'xml' | 'pdf') => {
    setDownloadingId(`${invoice.id}-${format}`);
    try {
      await downloadCfdi(invoice.id, invoice.invoiceNumber, format);
    } catch {
      toast.error(t('downloadError'));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleGenerate = async (invoiceId: string) => {
    try {
      await generateCfdi.mutateAsync(invoiceId);
      toast.success(t('cfdiGenerated'));
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? t('cfdiGenerationError'));
    }
  };

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded-2xl border border-border bg-surface" />;
  }

  const invoices = data?.items ?? [];

  if (invoices.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-10 text-center">
        <p className="text-sm text-text-secondary">{t('emptyState')}</p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-text-secondary">
            <tr>
              <th className="px-6 py-4 font-medium">{t('colInvoice')}</th>
              <th className="px-6 py-4 font-medium">{t('colPeriod')}</th>
              <th className="px-6 py-4 font-medium">{t('colTotal')}</th>
              {isMexican && <th className="px-6 py-4 font-medium">{t('colCfdi')}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td className="px-6 py-4 font-medium text-text-primary">
                  {invoice.invoiceNumber}
                </td>
                <td className="px-6 py-4 text-text-secondary">
                  {invoice.periodStart && invoice.periodEnd
                    ? `${new Date(invoice.periodStart).toLocaleDateString('es-MX')} – ${new Date(
                        invoice.periodEnd,
                      ).toLocaleDateString('es-MX')}`
                    : '—'}
                </td>
                <td className="px-6 py-4 text-text-primary">
                  {invoice.total.toLocaleString('es-MX', {
                    style: 'currency',
                    currency: 'MXN',
                  })}
                </td>

                {isMexican && (
                  <td className="px-6 py-4">
                    {invoice.cfdiStatus === 'STAMPED' && (
                      <div className="flex gap-2">
                        {(['xml', 'pdf'] as const).map((format) => (
                          <button
                            key={format}
                            onClick={() => handleDownload(invoice, format)}
                            disabled={downloadingId === `${invoice.id}-${format}`}
                            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary disabled:opacity-50"
                          >
                            {downloadingId === `${invoice.id}-${format}` ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Download size={14} />
                            )}
                            {format.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* El cliente puede arreglarlo: se le dice qué y se le da el botón. */}
                    {invoice.cfdiErrorKind === 'CLIENT_DATA' &&
                      invoice.cfdiStatus !== 'STAMPED' && (
                        <div className="flex flex-col items-start gap-2">
                          <span className="flex items-center gap-1.5 text-xs text-warning-500">
                            <AlertTriangle size={14} />
                            {t('cfdiNeedsFiscalData')}
                          </span>
                          <button
                            onClick={() => handleGenerate(invoice.id)}
                            disabled={generateCfdi.isPending}
                            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            {generateCfdi.isPending ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <RefreshCw size={14} />
                            )}
                            {t('generateCfdi')}
                          </button>
                        </div>
                      )}

                    {/* Fallo nuestro: nada que el cliente pueda hacer, así que ningún botón. */}
                    {invoice.cfdiErrorKind === 'INTERNAL' && invoice.cfdiStatus !== 'STAMPED' && (
                      <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                        <Clock size={14} />
                        {t('cfdiInProgress')}
                      </span>
                    )}

                    {invoice.cfdiStatus === 'PENDING' && !invoice.cfdiErrorKind && (
                      <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                        <Clock size={14} />
                        {t('cfdiPending')}
                      </span>
                    )}

                    {invoice.cfdiStatus === 'STAMPING' && (
                      <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                        <Loader2 size={14} className="animate-spin" />
                        {t('cfdiStamping')}
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-border px-6 py-3">
        <CursorPager
          prevCursor={data?.prevCursor ?? null}
          nextCursor={data?.nextCursor ?? null}
          nextPageAvailable={data?.nextPageAvailable ?? false}
          onNavigate={(nextCursorValue, nextAction) => {
            setCursor(nextCursorValue);
            setAction(nextAction);
          }}
          prevLabel={t('previous')}
          nextLabel={t('next')}
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setCursor(null);
            setAction(null);
          }}
        />
      </div>
    </section>
  );
}
