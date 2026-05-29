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
    <div className="relative overflow-hidden rounded-3xl bg-accent p-8 text-text-inverse shadow-2xl">
      {/* Background decoration */}
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
      <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-white/5 blur-3xl" />

      <div className="relative z-10 flex flex-col justify-between gap-8 md:flex-row md:items-end">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-widest opacity-60">
            {isNegative ? (
              <>
                <AlertCircle size={16} className="text-danger" />
                <span className="text-danger-400">Balance Negativo (Overdraft)</span>
              </>
            ) : (
              <span>Créditos Disponibles</span>
            )}
          </div>

          <div className="flex items-baseline gap-1">
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`font-geist-mono text-7xl font-light tracking-tighter ${isNegative ? 'text-danger-400' : ''}`}
            >
              {isNegative ? '-' : ''}
              {formattedBalance}
            </motion.span>
            <span className="text-xl font-medium opacity-40">créditos</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div
            className={`rounded-full px-4 py-1.5 text-sm font-medium backdrop-blur-md ${isNegative ? 'bg-danger/20 text-danger-500' : 'bg-white/10 text-text-inverse'}`}
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
