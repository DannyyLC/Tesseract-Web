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
      <div className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-6 md:p-8">
        <div className="relative z-10 flex h-full flex-col">
          <div className="mb-6 flex items-center gap-2 text-sm font-medium text-info">
            <Zap size={16} />
            <span>ESTADO DE SUSCRIPCIÓN</span>
          </div>

          <div className="mb-8 flex items-end gap-3">
            <h2 className="text-5xl font-bold tracking-tight text-text-primary">
              {currentPlan}
            </h2>
            <span className="mb-1.5 font-medium text-text-tertiary">
              {currentPlan === 'FREE' ? 'Nivel Inicial' : 'Suscripción Mensual'}
            </span>
          </div>

          <div className="w-full space-y-4">
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium text-text-secondary">
                Bolsa de Créditos (Acumulable)
              </span>
              <span className="font-bold text-text-primary">
                {creditsUsed.toLocaleString()} / {creditsTotal.toLocaleString()}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-secondary">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className={`h-full rounded-full ${
                  percentage > 90 ? 'bg-warning-500' : 'bg-info'
                }`}
              />
            </div>
            <div className="mt-6">
              <p className="flex items-center gap-1.5 text-xs font-medium text-text-tertiary">
                <Shield size={12} />
                El próximo corte de facturación es el{' '}
                {new Date(subscription?.currentPeriodEnd).toLocaleDateString('es-MX', {
                  timeZone: 'UTC',
                })}
                .
              </p>
            </div>
          </div>
        </div>

        {/* Glow effect */}
        <div className="absolute right-0 top-0 -mr-40 -mt-40 h-80 w-80 rounded-full bg-info/5 blur-[100px] transition-colors duration-700 group-hover:bg-info/10" />
      </div>
    </div>
  );
}
