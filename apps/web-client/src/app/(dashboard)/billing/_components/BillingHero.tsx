import { motion } from 'framer-motion';
import { Shield, CreditCard, AlertTriangle, ArrowDownRight } from 'lucide-react';
import { SubscriptionPlan, OVERAGE_PRICE_PER_CREDIT } from '@tesseract/types';

interface BillingHeroProps {
  plan: SubscriptionPlan;
  status: string;
  nextBillingDate: string | Date | null;
  credits: {
    available: number;
    usedThisMonth: number;
    limit: number;
  };
  cancelAtPeriodEnd?: boolean;
  pendingPlanChange?: string | null;
  allowOverages?: boolean;
  maxOverageLimit?: number;
  currentOverageLimit?: number;
}

export default function BillingHero({
  plan,
  status,
  nextBillingDate,
  credits,
  cancelAtPeriodEnd = false,
  pendingPlanChange = null,
}: BillingHeroProps) {
  const isNegative = credits.available < 0;
  const formattedBalance = Math.abs(credits.available).toLocaleString();
  const nextDateFormatted = nextBillingDate
    ? new Date(nextBillingDate).toLocaleDateString('es-MX', { timeZone: 'UTC' })
    : 'N/A';

  // Plan Display Helper
  const getPlanLabel = (p: SubscriptionPlan) => {
    if (p === SubscriptionPlan.FREE) return 'Nivel Inicial';
    return 'Suscripción Premium';
  };

  // Subscription Status Helper
  const getStatusConfig = (s: string) => {
    switch (s) {
      case 'active':
      case 'ACTIVE':
        return {
          label: 'Activo',
          color: 'bg-emerald-500',
          text: 'text-emerald-300 dark:text-emerald-400',
          bg: 'bg-emerald-500/20',
        };
      case 'PAST_DUE':
      case 'past_due':
        return {
          label: 'Pago Pendiente',
          color: 'bg-red-500',
          text: 'text-red-300 dark:text-red-400',
          bg: 'bg-red-500/20',
        };
      case 'CANCELED':
      case 'canceled':
        return {
          label: 'Cancelado',
          color: 'bg-gray-500',
          text: 'text-gray-300 dark:text-gray-400',
          bg: 'bg-gray-500/20',
        };
      default:
        return {
          label: s,
          color: 'bg-gray-500',
          text: 'text-gray-300 dark:text-gray-400',
          bg: 'bg-gray-500/20',
        };
    }
  };
  // If user is on FREE plan, they're always "Active" from their perspective
  // CANCELED is an internal state of the previous subscription, not relevant to show
  const effectiveStatus = plan === SubscriptionPlan.FREE ? 'ACTIVE' : status;
  const statusConfig = getStatusConfig(effectiveStatus);

  return (
    <div className="relative overflow-hidden rounded-3xl bg-black p-8 text-white shadow-2xl transition-all dark:bg-white dark:text-black">
      {/* Background decoration */}
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/5 blur-3xl dark:bg-black/5" />
      <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-white/5 blur-3xl dark:bg-black/5" />

      <div className="relative z-10 flex flex-col justify-between gap-10 lg:flex-row lg:items-end">
        {/* Left Side: Credits */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-widest opacity-60">
            {isNegative ? (
              <>
                <span className="text-red-600 dark:text-red-500">Balance Negativo</span>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span>Créditos Disponibles</span>
              </div>
            )}
          </div>

          <div className="flex items-baseline gap-2">
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`font-geist-mono text-7xl font-light tracking-tighter ${isNegative ? 'text-red-600 dark:text-red-500' : ''}`}
            >
              {isNegative ? '-' : ''}
              {formattedBalance}
            </motion.span>
            <span className="text-xl font-medium opacity-40">créditos</span>
          </div>

          {/* Negative Balance Helper Text */}
          {isNegative && (
            <p className="max-w-md text-sm text-red-600/80 dark:text-red-500/80">
              Has excedido tu límite. El consumo extra (${OVERAGE_PRICE_PER_CREDIT}/crédito) se cargará en tu próxima
              factura.
            </p>
          )}
        </div>

        {/* Right Side: Subscription Info */}
        <div className="flex flex-col gap-6 lg:items-end lg:text-right">
          {/* Plan Badge */}
          <div className="flex items-center gap-3 lg:flex-row-reverse">
            <div className="rounded-xl bg-white/10 p-2.5 backdrop-blur-md dark:bg-black/10">
              <CreditCard size={24} className="opacity-80" />
            </div>
            <div>
              <h3 className="text-xl font-bold leading-none">{plan}</h3>
              <p className="text-xs font-medium uppercase tracking-wider opacity-50">
                {getPlanLabel(plan)}
              </p>
            </div>
          </div>

          {/* Billing Info */}
          <div className="space-y-1">
            {cancelAtPeriodEnd ? (
              <div
                className="inline-flex items-center gap-2 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold uppercase tracking-widest text-amber-300 dark:text-amber-400"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                Cancelación Pendiente
              </div>
            ) : pendingPlanChange ? (
              <div
                className="inline-flex items-center gap-2 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-bold uppercase tracking-widest text-blue-300 dark:text-blue-400"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                Cambio programado → {pendingPlanChange}
              </div>
            ) : (
              <div
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest ${statusConfig.bg} ${statusConfig.text}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.color} animate-pulse`} />
                {statusConfig.label}
              </div>
            )}

            {(status === 'PAST_DUE' || status === 'past_due') && (
              <p className="max-w-[200px] text-right text-xs text-red-400 dark:text-red-300">
                No pudimos procesar tu último pago. Por favor actualiza tu método de pago para
                evitar interrupciones.
              </p>
            )}

            {nextBillingDate && plan !== SubscriptionPlan.FREE && status !== 'CANCELED' && (
              <div className="flex items-center gap-2 text-sm opacity-50 lg:justify-end">
                {cancelAtPeriodEnd ? (
                  <>
                    <AlertTriangle size={14} />
                    <span>Se cancela el {nextDateFormatted}</span>
                  </>
                ) : pendingPlanChange ? (
                  <>
                    <ArrowDownRight size={14} />
                    <span>Cambia a {pendingPlanChange} el {nextDateFormatted}</span>
                  </>
                ) : (
                  <>
                    <Shield size={14} />
                    <span>Renueva el {nextDateFormatted}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
