'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { LogoLoader } from '@/components/ui/logo-loader';
import { useAdjustAdminCredits, useAdminOrgCredits } from '@/hooks/billing/use-admin-billing';
import { btnGhost, btnPrimary, inputClass, labelClass } from '@/app/[locale]/admin/_styles';

interface Props {
  organizationId: string;
}

export function CreditsTab({ organizationId }: Props) {
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
          toast.success('Créditos ajustados');
          closeAdjust();
          setCursor(undefined);
          setDirection(undefined);
        },
        onError: (e: any) => !e?.toastHandled && toast.error(e?.message ?? 'No se pudo ajustar'),
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
        <LogoLoader text="Cargando créditos" />
      </div>
    );
  }

  const { items, nextCursor, prevCursor, nextPageAvailable } = data.creditTransactions;

  return (
    <div className="max-w-2xl space-y-6">
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Balance</h2>
            <p className="mt-1 text-2xl font-semibold text-text-primary">{data.balance}</p>
            <p className="text-xs text-text-secondary">
              {data.currentMonthSpent} créditos gastados este mes
            </p>
          </div>
          <button className={btnPrimary} onClick={() => setIsAdjusting(true)}>
            <Plus size={16} /> Ajustar créditos
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface">
        <div className="border-b border-border p-4">
          <h2 className="text-sm font-semibold text-text-primary">Historial</h2>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-text-secondary">
            Sin transacciones todavía.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-text-primary">
                    {tx.description ?? tx.type}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {new Date(tx.createdAt).toLocaleString('es-MX')} · {tx.type}
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

        {(prevCursor || nextPageAvailable) && (
          <div className="flex items-center justify-end gap-2 border-t border-border p-3">
            <button
              onClick={() => prevCursor && navigate(prevCursor, 'prev')}
              disabled={!prevCursor}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={14} /> Anterior
            </button>
            <button
              onClick={() => nextCursor && navigate(nextCursor, 'next')}
              disabled={!nextPageAvailable || !nextCursor}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siguiente <ChevronRight size={14} />
            </button>
          </div>
        )}
      </section>

      <Modal isOpen={isAdjusting} onClose={closeAdjust} title="Ajustar créditos">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Usa un monto negativo para restar créditos. Queda registrado en el historial con el
            motivo que pongas.
          </p>
          <div>
            <label className={labelClass}>Monto (+/-)</label>
            <input
              type="number"
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ej. 500 o -200"
            />
          </div>
          <div>
            <label className={labelClass}>Motivo</label>
            <input
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Compensación por incidencia del 10/08"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button className={btnGhost} onClick={closeAdjust}>
              Cancelar
            </button>
            <button
              className={btnPrimary}
              onClick={handleAdjust}
              disabled={!canAdjust || adjustCredits.isPending}
            >
              {adjustCredits.isPending && <Loader2 size={14} className="animate-spin" />}
              {adjustCredits.isPending ? 'Ajustando…' : 'Ajustar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
