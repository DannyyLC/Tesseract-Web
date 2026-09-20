'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { toast } from 'sonner';
import { AlertTriangle, Calendar, Loader2, Unplug } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { LogoLoader } from '@/components/ui/logo-loader';
import {
  useBookingCalendarStatus,
  useBookingCalendars,
  useDisconnectBookingCalendar,
  useSelectBookingCalendar,
} from '@/hooks/platform/use-booking-admin';
import RootApi from '@/lib/api/endpoints/root-api';
import { btnGhost, btnPrimary, inputClass } from '../_styles';

const CALENDAR_ERROR_KEYS: Record<string, string> = {
  access_denied: 'errorAccessDenied',
  missing_code: 'errorMissingCode',
  callback_failed: 'errorCallbackFailed',
};

function CalendarioContent() {
  const t = useTranslations('Admin.Calendario');
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: status, isLoading, isError } = useBookingCalendarStatus();
  const disconnectCalendar = useDisconnectBookingCalendar();
  const {
    data: calendars,
    isLoading: calendarsLoading,
    isError: calendarsError,
  } = useBookingCalendars(!!status?.connected);
  const selectCalendar = useSelectBookingCalendar();
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get('calendarConnected')) {
      toast.success(t('toastConnected'));
      router.replace('/admin/calendario');
    }
    const error = searchParams.get('calendarError');
    if (error) {
      toast.error(t(CALENDAR_ERROR_KEYS[error] ?? 'errorGeneric'));
      router.replace('/admin/calendario');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleConnect = () => {
    const api = RootApi.getInstance().getBookingAdminApi();
    api.redirectToConnect();
  };

  const handleDisconnect = () => {
    disconnectCalendar.mutate(undefined, {
      onSuccess: () => {
        toast.success(t('toastDisconnected'));
        setConfirmOpen(false);
      },
      onError: () => toast.error(t('toastDisconnectError')),
    });
  };

  const handleSelectCalendar = (calendarId: string) => {
    if (calendarId === status?.calendarId) return;
    selectCalendar.mutate(calendarId, {
      onSuccess: () => toast.success(t('toastCalendarUpdated')),
      onError: () => toast.error(t('toastCalendarUpdateError')),
    });
  };

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">{t('title')}</h1>
        <p className="text-sm text-text-secondary">{t('subtitle')}</p>
      </div>

      <section className="rounded-xl border border-border bg-surface">
        <div className="border-b border-border p-4">
          <h2 className="text-base font-semibold text-text-primary">
            {t('connectedAccountTitle')}
          </h2>
          <p className="text-xs text-text-secondary">{t('connectedAccountSubtitle')}</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <LogoLoader text={t('loadingStatus')} />
          </div>
        ) : isError ? (
          <p className="py-16 text-center text-sm text-text-secondary">
            {t('loadStatusError')}
          </p>
        ) : status?.connected ? (
          <>
            <div className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success-500/10 text-success-500">
                  <Calendar size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">
                      {status.googleAccountEmail}
                    </span>
                    <span className="flex items-center gap-1.5 rounded-full bg-[var(--badge-success-bg-solid)] px-2.5 py-0.5 text-xs font-medium text-[var(--badge-success-text-solid)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
                      {t('connectedBadge')}
                    </span>
                  </div>
                  <p className="text-xs text-text-tertiary">{t('eventsHint')}</p>
                </div>
              </div>
              <button className={btnGhost} onClick={() => setConfirmOpen(true)}>
                <Unplug size={16} /> {t('disconnectButton')}
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-border p-4">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {t('targetCalendarTitle')}
                </p>
                <p className="text-xs text-text-secondary">
                  {t('targetCalendarSubtitle', { email: status.googleAccountEmail ?? '' })}
                </p>
              </div>
              <div className="flex w-72 shrink-0 items-center gap-2">
                {calendarsLoading ? (
                  <Loader2 size={16} className="shrink-0 animate-spin text-text-tertiary" />
                ) : calendarsError ? (
                  <p className="text-xs text-text-secondary">{t('calendarsLoadError')}</p>
                ) : (
                  <select
                    className={inputClass}
                    value={status.calendarId ?? 'primary'}
                    onChange={(e) => handleSelectCalendar(e.target.value)}
                    disabled={selectCalendar.isPending}
                  >
                    {calendars?.map((cal) => (
                      <option key={cal.id} value={cal.id}>
                        {cal.summary}
                        {cal.primary ? t('primaryTag') : ''}
                      </option>
                    ))}
                  </select>
                )}
                {selectCalendar.isPending && (
                  <Loader2 size={14} className="shrink-0 animate-spin text-text-tertiary" />
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-secondary text-text-tertiary">
              <Calendar size={22} />
            </div>
            <p className="text-sm text-text-secondary">{t('emptyStateDescription')}</p>
            <button className={btnPrimary} onClick={handleConnect}>
              {t('connectButton')}
            </button>
          </div>
        )}
      </section>

      <Modal
        isOpen={confirmOpen}
        onClose={disconnectCalendar.isPending ? () => {} : () => setConfirmOpen(false)}
        title={t('disconnectModalTitle')}
      >
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl border border-[var(--danger-banner-border)] bg-[var(--danger-banner-bg)] p-4">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--danger-text-adaptive)]" />
            <p className="text-sm text-[var(--danger-text-adaptive)]">
              {t('disconnectModalWarning')}
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              className="flex-1 rounded-xl bg-surface-secondary px-4 py-2 font-medium text-text-primary transition-colors hover:bg-surface-elevated"
              onClick={() => setConfirmOpen(false)}
              disabled={disconnectCalendar.isPending}
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2 font-medium text-brand-white transition-colors hover:bg-danger-600 disabled:opacity-50"
              onClick={handleDisconnect}
              disabled={disconnectCalendar.isPending}
            >
              {disconnectCalendar.isPending && <Loader2 size={14} className="animate-spin" />}
              {disconnectCalendar.isPending ? t('disconnecting') : t('disconnectButton')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function AdminCalendarioPage() {
  const t = useTranslations('Admin.Calendario');
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <LogoLoader text={t('loadingFallback')} />
        </div>
      }
    >
      <CalendarioContent />
    </Suspense>
  );
}
