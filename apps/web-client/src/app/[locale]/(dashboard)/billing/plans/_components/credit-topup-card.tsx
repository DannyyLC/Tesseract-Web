'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Coins, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { CREDIT_TOPUP_QUICK_AMOUNTS, isValidTopUpQuantity, PlanPrices } from '@tesseract/types';
import { useAuth } from '@/hooks/identity/use-auth';
import { useBillingMutations } from '@/hooks/billing/use-billing';
import { useBillingCurrency } from '@/hooks/billing/use-billing-currency';
import { Modal } from '@/components/ui/modal';
import {
  TwoFactorCodeInput,
  isTwoFactorCodeComplete,
} from '@/components/ui/two-factor-code-input';
import PermissionGuard from '@/components/auth/permission-guard';

interface CreditTopUpCardProps {
  perCredit: PlanPrices;
  min: number;
  max: number;
  step: number;
}

/**
 * Recarga de créditos de compra única, en cantidad libre — no son paquetes fijos. El precio por
 * crédito ya viene calibrado (`GET /billing/plans`) para quedar por encima de lo que cuesta el
 * crédito incluido en cualquier plan y por debajo del overage: comprar aquí nunca debe salir más
 * barato que subir de plan, y siempre debe salir más barato que pasarse sin haber comprado nada.
 */
export default function CreditTopUpCard({ perCredit, min, max, step }: CreditTopUpCardProps) {
  const t = useTranslations('BillingCreditTopUp');
  const { data: authUser } = useAuth();
  const { createCreditCheckoutSession } = useBillingMutations();
  const { currency, format } = useBillingCurrency();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [credits, setCredits] = useState<number>(step * Math.round(CREDIT_TOPUP_QUICK_AMOUNTS[0] / step));
  const [customValue, setCustomValue] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [code2FA, setCode2FA] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const hasHighlighted = useRef(false);
  const [isHighlighted, setIsHighlighted] = useState(false);

  // Deep-link desde el botón "Comprar créditos" de /billing: resalta y hace scroll hasta esta
  // tarjeta. Limpia su propio query param — independiente del que ya limpia el resto de la
  // página (`from_portal`/`from_checkout`), que nunca coincide con este en la misma visita.
  useEffect(() => {
    if (hasHighlighted.current) return;
    if (searchParams.get('highlight') !== 'credits') return;

    hasHighlighted.current = true;
    setIsHighlighted(true);
    containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // `pathname` viene de next-intl (`usePathname`) y ya llega SIN el prefijo de locale — a
    // diferencia de `window.location.pathname`, que sí lo trae. Pasarle a este `router.replace`
    // una ruta que ya incluye el locale hace que next-intl se lo anteponga otra vez
    // (`/es/es/billing/plans`), una ruta que no existe → 404. Mismo patrón que
    // `welcome-onboarding.tsx`.
    const newSearchParams = new URLSearchParams(searchParams.toString());
    newSearchParams.delete('highlight');
    const newQuery = newSearchParams.toString();
    router.replace(`${pathname}${newQuery ? `?${newQuery}` : ''}`, { scroll: false });

    const timeout = setTimeout(() => setIsHighlighted(false), 3000);
    return () => clearTimeout(timeout);
  }, [searchParams, router, pathname]);

  const perCreditMinor = perCredit[currency];
  const totalMinor = perCreditMinor !== undefined ? credits * perCreditMinor : undefined;
  const isValid = isValidTopUpQuantity(credits);
  const twoFactorEnabled = Boolean(authUser?.twoFactorEnabled);

  const selectQuickAmount = (amount: number) => {
    setCustomValue('');
    setCredits(amount);
  };

  const handleCustomChange = (raw: string) => {
    // `type="number"` ya restringe los caracteres que se pueden teclear, así que aquí no hace
    // falta la limpieza de dígitos que sí necesitaba el `type="text"` anterior.
    setCustomValue(raw);
    const parsed = raw === '' ? 0 : parseInt(raw, 10);
    setCredits(Number.isNaN(parsed) ? 0 : parsed);
  };

  const openConfirm = () => {
    if (!isValid) return;
    setShowConfirm(true);
  };

  const closeConfirm = () => {
    setShowConfirm(false);
    setCode2FA('');
  };

  const handleConfirm = async () => {
    if (twoFactorEnabled && !isTwoFactorCodeComplete(code2FA)) {
      toast.error(t('code2FARequired'));
      return;
    }

    try {
      setIsSubmitting(true);
      const { url } = await createCreditCheckoutSession.mutateAsync({
        credits,
        code2FA: twoFactorEnabled ? code2FA : undefined,
      });
      window.open(url, '_blank');
      closeConfirm();
    } catch (error: any) {
      const message = error?.response?.data?.message;
      if (message === '2FA_REQUIRED' || message === '2FA_INVALID') {
        toast.error(t('code2FAInvalid'));
      } else {
        toast.error(t('genericError'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="credit-topup-card"
      ref={containerRef}
      className={`rounded-2xl border bg-surface p-6 transition-all duration-500 ${
        isHighlighted ? 'ring-2 ring-accent' : 'border-border'
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-secondary text-text-secondary">
          <Coins size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-text-primary">{t('title')}</h3>
          <p className="mt-1 text-sm text-text-secondary">{t('description')}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {CREDIT_TOPUP_QUICK_AMOUNTS.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => selectQuickAmount(amount)}
                className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                  !customValue && credits === amount
                    ? 'border-accent bg-accent text-text-inverse'
                    : 'border-border text-text-primary hover:bg-surface-secondary'
                }`}
              >
                {amount.toLocaleString()}
              </button>
            ))}
          </div>

          {/* La etiqueta larga vive en su propia línea, aparte de cualquier otra cosa que le
              pelee ancho: dentro de una fila flexible junto al total y el botón, competía por
              espacio con el input de 160px y el espaciado se veía apretado. */}
          <div className="mt-4">
            <label
              htmlFor="customCredits"
              className="mb-2 block text-xs font-medium text-text-secondary"
            >
              {t('customAmountLabel', { min, max, step })}
            </label>
            <input
              id="customCredits"
              type="number"
              inputMode="numeric"
              step={step}
              min={min}
              max={max}
              value={customValue}
              onChange={(e) => handleCustomChange(e.target.value)}
              placeholder={t('customAmountPlaceholder')}
              className="w-40 rounded-xl border border-input-border bg-input-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-input-border-focus"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div className="flex-1">
              <p className="text-xs font-medium text-text-secondary">{t('totalLabel')}</p>
              <p className="font-geist-mono text-xl font-bold text-text-primary">
                {totalMinor !== undefined ? (
                  <>
                    {format(totalMinor)}{' '}
                    <span className="text-sm font-medium text-text-tertiary">
                      {currency.toUpperCase()}
                    </span>
                  </>
                ) : (
                  '—'
                )}
              </p>
            </div>

            <PermissionGuard permissions="billing:checkout">
              <button
                type="button"
                onClick={openConfirm}
                disabled={!isValid}
                className="rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {t('buyButton')}
              </button>
            </PermissionGuard>
          </div>

          {!isValid && credits > 0 && (
            <p className="mt-2 text-xs text-danger">
              {t('invalidAmount', { min, max, step })}
            </p>
          )}
        </div>
      </div>

      <Modal isOpen={showConfirm} onClose={closeConfirm} title={t('confirmTitle')}>
        <div className="space-y-4">
          <div className="bg-info/10 rounded-lg p-4 text-sm text-info-600">
            <p>
              {t('confirmIntroBefore')} <strong>{credits.toLocaleString()}</strong>{' '}
              {t('confirmIntroMiddle')}{' '}
              <strong>
                {totalMinor !== undefined ? `${format(totalMinor)} ${currency.toUpperCase()}` : '—'}
              </strong>
              .
            </p>
          </div>

          <p className="text-xs text-text-secondary">{t('confirmNote')}</p>

          {twoFactorEnabled && (
            <TwoFactorCodeInput
              value={code2FA}
              onChange={setCode2FA}
              onSubmit={handleConfirm}
              label={t('code2FALabel')}
            />
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={closeConfirm}
              className="rounded-xl px-4 py-2 text-sm font-bold text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
            >
              {t('cancelButton')}
            </button>
            <button
              onClick={handleConfirm}
              disabled={isSubmitting || (twoFactorEnabled && !isTwoFactorCodeComplete(code2FA))}
              className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-text-inverse hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              {t('confirmButton')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
