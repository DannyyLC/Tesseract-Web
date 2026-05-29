import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';

interface CreditDisplayProps {
  balance: number;
  currencySymbol?: string;
}

export default function CreditDisplay({ balance, currencySymbol = '' }: CreditDisplayProps) {
  const isNegative = balance < 0;

  // Format number with commas
  const formattedBalance = Math.abs(balance).toLocaleString();

  return (
    <div className="relative overflow-hidden rounded-3xl bg-black p-8 text-white shadow-2xl dark:bg-white dark:text-black">
      {/* Background decoration */}
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/5 blur-3xl dark:bg-black/5" />
      <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-white/5 blur-3xl dark:bg-black/5" />

      <div className="relative z-10 flex flex-col justify-between gap-8 md:flex-row md:items-end">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-widest opacity-60">
            {isNegative ? (
              <>
                <AlertCircle size={16} className="text-red-500" />
                <span className="text-red-400">Balance Negativo (Overdraft)</span>
              </>
            ) : (
              <span>Créditos Disponibles</span>
            )}
          </div>

          <div className="flex items-baseline gap-1">
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`font-geist-mono text-7xl font-light tracking-tighter ${isNegative ? 'text-red-400' : ''}`}
            >
              {isNegative ? '-' : ''}
              {formattedBalance}
            </motion.span>
            <span className="text-xl font-medium opacity-40">créditos</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div
            className={`rounded-full px-4 py-1.5 text-sm font-medium backdrop-blur-md ${isNegative ? 'bg-red-500/20 text-red-200 dark:text-red-800' : 'bg-white/10 text-white dark:bg-black/10 dark:text-black'}`}
          >
            {isNegative ? 'Pago pendiente' : 'Activo'}
          </div>
          {isNegative && (
            <p className="max-w-[200px] text-right text-xs opacity-60">
              El consumo excedente se facturará en el próximo ciclo.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
