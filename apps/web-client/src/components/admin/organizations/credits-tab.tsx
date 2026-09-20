'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, Plus } from 'lucide-react';
import { CursorPager } from '@/components/ui/cursor-pager';
import { Modal } from '@/components/ui/modal';
import { LogoLoader } from '@/components/ui/logo-loader';
import { useAdjustAdminCredits, useAdminOrgCredits } from '@/hooks/billing/use-admin-billing';
import { useApiErrorMessage } from '@/hooks/shared/use-api-error-message';
import { toIntlLocale } from '@/lib/intl-locale';
import type { AdminOrganizationDetail } from '@/lib/api/endpoints/identity/organizations/organizations-admin-api';
import { btnGhost, btnPrimary, inputClass, labelClass } from '@/app/[locale]/admin/_styles';

interface Props {
  organizationId: string;
  org: AdminOrganizationDetail;
}

export function CreditsTab({ organizationId, org }: Props) {
  const t = useTranslations('Admin.CreditsTab');
  const intlLocale = toIntlLocale(useLocale());
  const getApiErrorMessage = useApiErrorMessage();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [direction, setDirection] = useState<'next' | 'prev' | undefined>(undefined);
  const { data, isLoading } = useAdminOrgCredits(organizationId, cursor, direction);
  const adjustCredits = useAdjustAdminCredits();

  const [isAdjusting, setIsAdjusting] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const closeAdjust = () => {
    setIsAdjusting(false);
    setAmount('');
    setReason('');
  };

  const amountValue = Number(amount);
  const canAdjust = amount.trim() !== '' && Number.isInteger(amountValue) && amountValue !== 0 && reason.trim().length >= 3;

  const handleAdjust = () => {
    if (!canAdjust) return;
    adjustCredits.mutate(
      { organizationId, data: { amount: amountValue, reason: reason.trim() } },
      {
        onSuccess: () => {
          toast.success(t('adjustedSuccess'));
          closeAdjust();
          setCursor(undefined);
          setDirection(undefined);
        },
        onError: (e: any) => !e?.toastHandled && toast.error(getApiErrorMessage(e)),
      },
    );
  };

  const navigate = (nextCursor: string, dir: 'next' | 'prev') => {
    setCursor(nextCursor);
    setDirection(dir);
  };

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-16">
        <LogoLoader text={t('loading')} />
      </div>
    );
  }

  const { items, nextCursor, prevCursor, nextPageAvailable } = data.creditTransactions;

  // `planLimits.limits` ya resuelve los overrides custom de la organización sobre el plan
  // (ver getEffectiveLimits en el gateway), así que no hay que combinarlos acá.
  const { monthlyCredits, overageLimit } = org.planLimits.limits;

  // Un balance negativo *es* el sobregiro consumido: los créditos se descuentan hasta pasar de
  // cero y el negativo es la deuda acumulada del periodo.
  const overageUsed = data.balance < 0 ? -data.balance : 0;
  const overageRemaining = overageLimit === -1 ? null : Math.max(0, overageLimit - overageUsed);

  return (
    <div className="w-full space-y-6">
      <section className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">{t('balanceTitle')}</h2>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span
                className={`text-2xl font-semibold ${
                  data.balance < 0 ? 'text-danger' : 'text-text-primary'
                }`}
              >
                {data.balance.toLocaleString(intlLocale)}
              </span>
              {/* El denominador es lo que vuelve legible el balance: 750 no dice nada sin saber
                  de cuántos son, y los créditos del plan cambian con cada recalibración. */}
              <span className="text-sm text-text-secondary">
                {t('ofPlan', {
                  limit: monthlyCredits === -1 ? '∞' : monthlyCredits.toLocaleString(intlLocale),
                })}
              </span>
            </p>
            <p className="text-xs text-text-secondary">
              {t('spentThisMonth', { amount: data.currentMonthSpent.toLocaleString(intlLocale) })}
            </p>
          </div>
          <button className={btnPrimary} onClick={() => setIsAdjusting(true)}>
            <Plus size={16} /> {t('adjustCredits')}
          </button>
        </div>
      </section>

      {/* Sobregiro. Se edita en la pestaña Límites, pero se muestra acá porque es el único
          lugar donde un balance negativo tiene sentido: sin el límite al lado no se sabe
          cuánto le queda antes del corte. */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">{t('overageTitle')}</h2>
        {org.allowOverages ? (
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-text-secondary">{t('statusLabel')}</dt>
              <dd className="text-sm text-success-600">{t('statusAllowed')}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary">{t('limitLabel')}</dt>
              <dd className="text-sm text-text-primary">
                {overageLimit === -1
                  ? '∞'
                  : t('limitCredits', { limit: overageLimit.toLocaleString(intlLocale) })}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary">{t('usedLabel')}</dt>
              <dd className={`text-sm ${overageUsed > 0 ? 'text-danger' : 'text-text-primary'}`}>
                {overageUsed > 0
                  ? t('usedCredits', { used: overageUsed.toLocaleString(intlLocale) }) +
                    (overageRemaining === null
                      ? ''
                      : t('usedRemaining', { remaining: overageRemaining.toLocaleString(intlLocale) }))
                  : t('usedNone')}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-text-secondary">{t('overageNotAllowed')}</p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface">
        <div className="border-b border-border p-4">
          <h2 className="text-sm font-semibold text-text-primary">{t('historyTitle')}</h2>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-text-secondary">{t('historyEmpty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-text-primary">
                    {tx.description ?? tx.type}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {new Date(tx.createdAt).toLocaleString(intlLocale)} · {tx.type}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-medium ${
                    tx.amount >= 0 ? 'text-success-500' : 'text-danger'
                  }`}
                >
                  {tx.amount >= 0 ? '+' : ''}
                  {tx.amount}
                </span>
              </li>
            ))}
          </ul>
        )}

        <CursorPager
          prevCursor={prevCursor}
          nextCursor={nextCursor}
          nextPageAvailable={nextPageAvailable}
          prevLabel={t('prevPage')}
          nextLabel={t('nextPage')}
          onNavigate={navigate}
          className="border-t border-border p-3"
        />
      </section>

      <Modal isOpen={isAdjusting} onClose={closeAdjust} title={t('adjustModalTitle')}>
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">{t('adjustHint')}</p>
          <div>
            <label className={labelClass}>{t('amountLabel')}</label>
            <input
              type="number"
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t('amountPlaceholder')}
            />
          </div>
          <div>
            <label className={labelClass}>{t('reasonLabel')}</label>
            <input
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('reasonPlaceholder')}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button className={btnGhost} onClick={closeAdjust}>
              {t('cancel')}
            </button>
            <button
              className={btnPrimary}
              onClick={handleAdjust}
              disabled={!canAdjust || adjustCredits.isPending}
            >
              {adjustCredits.isPending && <Loader2 size={14} className="animate-spin" />}
              {adjustCredits.isPending ? t('adjusting') : t('adjust')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
