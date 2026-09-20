'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import { toast } from 'sonner';
import { AlertTriangle, Calendar, Loader2, Unplug } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { LogoLoader } from '@/components/ui/logo-loader';
import { useBookingCalendarStatus, useDisconnectBookingCalendar } from '@/hooks/platform/use-booking-admin';
import RootApi from '@/lib/api/endpoints/root-api';
import { btnGhost, btnPrimary } from '../_styles';

const CALENDAR_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Se canceló la autorización en Google.',
  missing_code: 'Google no devolvió un código de autorización.',
  callback_failed: 'Falló el intercambio del código con Google. Revisa los logs del gateway.',
};

function CalendarioContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: status, isLoading, isError } = useBookingCalendarStatus();
  const disconnectCalendar = useDisconnectBookingCalendar();
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get('calendarConnected')) {
      toast.success('Calendario conectado correctamente.');
      router.replace('/admin/calendario');
    }
    const error = searchParams.get('calendarError');
    if (error) {
      toast.error(CALENDAR_ERROR_MESSAGES[error] ?? 'No se pudo conectar el calendario.');
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
        toast.success('Calendario desconectado.');
        setConfirmOpen(false);
      },
      onError: () => toast.error('No se pudo desconectar el calendario.'),
    });
  };

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Calendario de reservas</h1>
        <p className="text-sm text-text-secondary">
          Reemplaza a Cal.com: la cuenta de Google conectada aquí es la que recibe las reservas
          del widget de soporte y crea los eventos con Google Meet.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-surface">
        <div className="border-b border-border p-4">
          <h2 className="text-base font-semibold text-text-primary">Cuenta conectada</h2>
          <p className="text-xs text-text-secondary">
            Solo puede haber una cuenta conectada a la vez; conectar una nueva reemplaza a la
            anterior.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <LogoLoader text="Cargando estado del calendario" />
          </div>
        ) : isError ? (
          <p className="py-16 text-center text-sm text-text-secondary">
            No se pudo cargar el estado del calendario.
          </p>
        ) : status?.connected ? (
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
                    Conectado
                  </span>
                </div>
                <p className="text-xs text-text-tertiary">
                  Los eventos con Google Meet se crean en el calendario principal de esta cuenta.
                </p>
              </div>
            </div>
            <button className={btnGhost} onClick={() => setConfirmOpen(true)}>
              <Unplug size={16} /> Desconectar
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-secondary text-text-tertiary">
              <Calendar size={22} />
            </div>
            <p className="text-sm text-text-secondary">
              Ningún calendario conectado. El widget de soporte no puede mostrar disponibilidad
              ni crear reservas hasta que se conecte una cuenta.
            </p>
            <button className={btnPrimary} onClick={handleConnect}>
              Conectar con Google
            </button>
          </div>
        )}
      </section>

      <Modal
        isOpen={confirmOpen}
        onClose={disconnectCalendar.isPending ? () => {} : () => setConfirmOpen(false)}
        title="Desconectar calendario"
      >
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl border border-[var(--danger-banner-border)] bg-[var(--danger-banner-bg)] p-4">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--danger-text-adaptive)]" />
            <p className="text-sm text-[var(--danger-text-adaptive)]">
              El widget de reservas de soporte dejará de funcionar hasta que se conecte otra
              cuenta. Las reservas ya creadas en Google Calendar no se ven afectadas.
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              className="flex-1 rounded-xl bg-surface-secondary px-4 py-2 font-medium text-text-primary transition-colors hover:bg-surface-elevated"
              onClick={() => setConfirmOpen(false)}
              disabled={disconnectCalendar.isPending}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2 font-medium text-brand-white transition-colors hover:bg-danger-600 disabled:opacity-50"
              onClick={handleDisconnect}
              disabled={disconnectCalendar.isPending}
            >
              {disconnectCalendar.isPending && <Loader2 size={14} className="animate-spin" />}
              {disconnectCalendar.isPending ? 'Desconectando…' : 'Desconectar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function AdminCalendarioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <LogoLoader text="Cargando" />
        </div>
      }
    >
      <CalendarioContent />
    </Suspense>
  );
}
