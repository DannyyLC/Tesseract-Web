'use client';

import { motion } from 'framer-motion';
import { Zap, Shield } from 'lucide-react';

interface StatusSectionProps {
  subscription: any;
  onCancel: () => void;
  isCanceling: boolean;
}

export default function StatusSection({ subscription, onCancel, isCanceling }: StatusSectionProps) {
  const currentPlan = subscription?.plan || 'FREE';
  const creditsUsed = subscription?.creditsUsed || 0;
  const creditsTotal = subscription?.creditsTotal || 100;
  const percentage = Math.min((creditsUsed / creditsTotal) * 100, 100);

  return (
    <div className="w-full">
      <div className="group relative overflow-hidden rounded-2xl border border-black/5 bg-white p-6 md:p-8 dark:border-white/5 dark:bg-[#0A0A0A]">
        <div className="relative z-10 flex h-full flex-col">
          <div className="mb-6 flex items-center gap-2 text-sm font-medium text-blue-500">
            <Zap size={16} />
            <span>ESTADO DE SUSCRIPCIÓN</span>
          </div>

          <div className="mb-8 flex items-end gap-3">
            <h2 className="text-5xl font-bold tracking-tight text-black dark:text-white">
              {currentPlan}
            </h2>
            <span className="mb-1.5 font-medium text-black/40 dark:text-white/40">
              {currentPlan === 'FREE' ? 'Nivel Inicial' : 'Suscripción Mensual'}
            </span>
          </div>

          <div className="w-full space-y-4">
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium text-black/60 dark:text-white/60">
                Bolsa de Créditos (Acumulable)
              </span>
              <span className="font-bold text-black dark:text-white">
                {creditsUsed.toLocaleString()} / {creditsTotal.toLocaleString()}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className={`h-full rounded-full ${
                  percentage > 90 ? 'bg-amber-500' : 'bg-blue-500'
                }`}
              />
            </div>
            <div className="mt-6">
              <p className="flex items-center gap-1.5 text-xs font-medium text-black/40 dark:text-white/40">
                <Shield size={12} />
                El próximo corte de facturación es el{' '}
                {new Date(subscription?.currentPeriodEnd).toLocaleDateString('es-MX', { timeZone: 'UTC' })}.
              </p>
            </div>
          </div>
        </div>

        {/* Glow effect */}
        <div className="absolute right-0 top-0 -mr-40 -mt-40 h-80 w-80 rounded-full bg-blue-500/5 blur-[100px] transition-colors duration-700 group-hover:bg-blue-500/10" />
      </div>
    </div>
  );
}
