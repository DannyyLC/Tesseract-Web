'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CheckCircle2, FileText, Loader2 } from 'lucide-react';
import { CFDI_USES, DEFAULT_CFDI_USE, TAX_REGIMES, normalizeRfc } from '@tesseract/types';
import { useFiscalProfile, useInvoiceMutations } from '@/hooks/billing/use-invoices';
import PermissionGuard from '@/components/auth/permission-guard';

const inputClass =
  'border-input placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Formulario de datos fiscales.
 *
 * Al guardar, el gateway los valida contra el padrón del SAT a través del PAC. Si el SAT los
 * rechaza no se guarda nada, y el mensaje de error que llega es el detalle campo por campo
 * que devuelve el PAC — se muestra tal cual, porque "datos inválidos" no le dice al cliente
 * qué corregir.
 */
export default function FiscalProfileCard() {
  const t = useTranslations('Invoices');
  const { data: profile, isLoading } = useFiscalProfile();
  const { saveFiscalProfile } = useInvoiceMutations();

  const [rfc, setRfc] = useState('');
  const [legalName, setLegalName] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [taxRegime, setTaxRegime] = useState('601');
  const [cfdiUse, setCfdiUse] = useState(DEFAULT_CFDI_USE);
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!profile) return;
    setRfc(profile.rfc);
    setLegalName(profile.legalName);
    setZipCode(profile.zipCode);
    setTaxRegime(profile.taxRegime);
    setCfdiUse(profile.cfdiUse);
    setEmail(profile.email);
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors([]);

    try {
      await saveFiscalProfile.mutateAsync({
        rfc,
        legalName,
        zipCode,
        taxRegime,
        cfdiUse,
        email,
      });
      toast.success(t('fiscalSaved'));
    } catch (error: any) {
      // El gateway devuelve el detalle del PAC en `details.errors` cuando el SAT rechaza.
      const details = error?.response?.data?.details?.errors;
      if (Array.isArray(details) && details.length > 0) {
        setFieldErrors(details.map((detail: { message: string }) => detail.message));
      }
      toast.error(error?.response?.data?.message ?? t('fiscalError'));
    }
  };

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-2xl border border-border bg-surface" />;
  }

  const isValidated = Boolean(profile?.validatedAt);

  return (
    <section className="space-y-6 rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
            <FileText className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{t('fiscalTitle')}</h2>
            <p className="text-sm text-text-secondary">{t('fiscalDescription')}</p>
          </div>
        </div>

        {isValidated && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-success-500/10 px-3 py-1 text-xs font-medium text-success-500">
            <CheckCircle2 size={14} />
            {t('fiscalValidated')}
          </span>
        )}
      </div>

      {!isValidated && (
        <p className="rounded-xl border border-warning-500/30 bg-warning-500/10 px-4 py-3 text-sm text-text-primary">
          {t('fiscalMissingWarning')}
        </p>
      )}

      {fieldErrors.length > 0 && (
        <div className="space-y-1 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm">
          <p className="font-medium text-text-primary">{t('fiscalRejected')}</p>
          <ul className="list-inside list-disc text-text-secondary">
            {fieldErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="rfc" className="text-sm font-medium text-text-primary">
              {t('rfcLabel')}
            </label>
            <input
              id="rfc"
              value={rfc}
              // Se normaliza mientras se escribe para que el cliente vea exactamente el valor
              // que se va a guardar, sin guiones ni minúsculas.
              onChange={(e) => setRfc(normalizeRfc(e.target.value))}
              className={inputClass}
              placeholder="XAXX010101000"
              maxLength={13}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="zipCode" className="text-sm font-medium text-text-primary">
              {t('zipLabel')}
            </label>
            <input
              id="zipCode"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value.replace(/\D/g, ''))}
              className={inputClass}
              placeholder="06600"
              maxLength={5}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="legalName" className="text-sm font-medium text-text-primary">
            {t('legalNameLabel')}
          </label>
          <input
            id="legalName"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            className={inputClass}
            placeholder={t('legalNamePlaceholder')}
            required
          />
          <p className="text-xs text-text-secondary">{t('legalNameHelp')}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="taxRegime" className="text-sm font-medium text-text-primary">
              {t('taxRegimeLabel')}
            </label>
            <select
              id="taxRegime"
              value={taxRegime}
              onChange={(e) => setTaxRegime(e.target.value)}
              className={inputClass}
            >
              {TAX_REGIMES.map((regime) => (
                <option key={regime.code} value={regime.code}>
                  {regime.code} — {regime.description}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="cfdiUse" className="text-sm font-medium text-text-primary">
              {t('cfdiUseLabel')}
            </label>
            <select
              id="cfdiUse"
              value={cfdiUse}
              onChange={(e) => setCfdiUse(e.target.value)}
              className={inputClass}
            >
              {CFDI_USES.map((use) => (
                <option key={use.code} value={use.code}>
                  {use.code} — {use.description}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="fiscalEmail" className="text-sm font-medium text-text-primary">
            {t('fiscalEmailLabel')}
          </label>
          <input
            id="fiscalEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            required
          />
        </div>

        <PermissionGuard permissions="fiscal_profile:update">
          <button
            type="submit"
            disabled={saveFiscalProfile.isPending}
            className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saveFiscalProfile.isPending && <Loader2 size={16} className="animate-spin" />}
            {saveFiscalProfile.isPending ? t('validating') : t('saveFiscal')}
          </button>
        </PermissionGuard>
      </form>
    </section>
  );
}
