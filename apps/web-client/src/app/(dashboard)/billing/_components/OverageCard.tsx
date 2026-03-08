import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import { useBillingMutations } from '@/hooks/useBilling';
import { toast } from 'sonner';

interface OverageCardProps {
  allowOverages: boolean;
  maxOverageLimit: number;
  currentOverageLimit: number;
}

const STEP = 5;
const COST_PER_CREDIT = 0.19;
const DEBOUNCE_MS = 1200;

export default function OverageCard({
  allowOverages,
  maxOverageLimit,
  currentOverageLimit,
}: OverageCardProps) {
  const { toggleOverages } = useBillingMutations();
  const [isToggling, setIsToggling] = useState(false);
  const [localLimit, setLocalLimit] = useState(currentOverageLimit);
  const [isEditingInput, setIsEditingInput] = useState(false);

  // Debounce ref — tracks the pending timeout for limit changes
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommittedRef = useRef(currentOverageLimit);

  // Sync local state when prop changes from server (e.g. after refetch)
  useEffect(() => {
    setLocalLimit(currentOverageLimit);
    lastCommittedRef.current = currentOverageLimit;
  }, [currentOverageLimit]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  /**
   * Debounced commit — updates local state immediately, but only sends
   * the API request after DEBOUNCE_MS of inactivity. This prevents
   * hitting the throttler when the user clicks +/- rapidly.
   */
  const debouncedCommit = useCallback(
    (newLimit: number) => {
      const clamped = Math.max(0, Math.min(newLimit, maxOverageLimit));
      setLocalLimit(clamped);

      // Clear any pending request
      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(async () => {
        if (clamped === lastCommittedRef.current) return;

        try {
          setIsToggling(true);
          await toggleOverages.mutateAsync({ allowOverages: true, overageLimit: clamped });
          lastCommittedRef.current = clamped;
          toast.success('Límite de excedentes actualizado');
        } catch (error: any) {
          if (!error.toastHandled) {
            toast.error('Error al actualizar límite', { description: error.message });
          }
          setLocalLimit(lastCommittedRef.current);
        } finally {
          setIsToggling(false);
        }
      }, DEBOUNCE_MS);
    },
    [maxOverageLimit, toggleOverages],
  );

  const handleToggle = async () => {
    try {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setIsToggling(true);
      await toggleOverages.mutateAsync({ allowOverages: !allowOverages, overageLimit: localLimit });
      toast.success(
        `Excedentes ${!allowOverages ? 'habilitados' : 'deshabilitados'} correctamente`,
      );
    } catch (error: any) {
      if (!error.toastHandled) {
        const message =
          error?.response?.data?.message ||
          error?.message ||
          (typeof error === 'string' ? error : 'Error desconocido');

        if (message.includes('No active subscription found') || error?.errorCode === 'HTTP_ERROR') {
          toast.error('No tienes una suscripción activa', {
            description: 'Debes tener un plan activo para habilitar excedentes.',
          });
        } else {
          toast.error('Error al cambiar configuración', { description: message });
        }
      }
    } finally {
      setIsToggling(false);
    }
  };

  const handleInputChange = (value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      setLocalLimit(Math.max(0, Math.min(num, maxOverageLimit)));
    } else if (value === '') {
      setLocalLimit(0);
    }
  };

  const handleInputBlur = () => {
    setIsEditingInput(false);
    if (localLimit !== lastCommittedRef.current) {
      debouncedCommit(localLimit);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  const estimatedCost = (localLimit * COST_PER_CREDIT).toFixed(2);

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-6 transition-shadow hover:shadow-sm dark:border-white/5 dark:bg-[#0A0A0A]">
      {/* Header — toggle + label, always visible */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-black dark:text-white">
            Excedentes de Créditos
          </h3>
          <p className="text-xs text-black/50 dark:text-white/50">
            {allowOverages
              ? 'El consumo extra se cobrará a $0.19/crédito.'
              : 'Los workflows se detendrán al agotar créditos.'}
          </p>
        </div>

        {/* Toggle switch */}
        <button
          onClick={handleToggle}
          disabled={isToggling}
          title={allowOverages ? 'Desactivar uso adicional' : 'Activar uso adicional'}
          aria-label={allowOverages ? 'Desactivar uso adicional' : 'Activar uso adicional'}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-black/20 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50 dark:focus:ring-white/20 dark:focus:ring-offset-[#0A0A0A] ${
            allowOverages
              ? 'bg-black dark:bg-white'
              : 'bg-black/10 dark:bg-white/20'
          }`}
        >
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="inline-block h-4 w-4 rounded-full bg-white shadow-sm dark:bg-[#0A0A0A]"
            style={{
              marginLeft: allowOverages ? '1.5rem' : '0.25rem',
            }}
          />
        </button>
      </div>

      {/* Limit Controls — only when overages are enabled */}
      <AnimatePresence>
        {allowOverages && maxOverageLimit > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <div className="mt-5 border-t border-black/5 pt-5 dark:border-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-black dark:text-white">
                    Límite de Gasto Extra
                  </p>
                  <p className="text-xs text-black/40 dark:text-white/40">
                    Máximo: {maxOverageLimit.toLocaleString()} créditos
                  </p>
                </div>

                {/* Numeric stepper */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => debouncedCommit(localLimit - STEP)}
                    disabled={isToggling || localLimit <= 0}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/10 text-black/60 transition-colors hover:bg-black/5 disabled:opacity-30 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5"
                  >
                    <Minus size={14} />
                  </button>

                  <input
                    type="text"
                    inputMode="numeric"
                    value={isEditingInput ? localLimit : localLimit.toLocaleString()}
                    onFocus={() => setIsEditingInput(true)}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onBlur={handleInputBlur}
                    onKeyDown={handleInputKeyDown}
                    disabled={isToggling}
                    className="h-9 w-24 rounded-xl border border-black/10 bg-transparent px-3 text-center font-geist-mono text-sm font-medium text-black tabular-nums focus:border-black/30 focus:outline-none disabled:opacity-50 dark:border-white/10 dark:text-white dark:focus:border-white/30"
                  />

                  <button
                    onClick={() => debouncedCommit(localLimit + STEP)}
                    disabled={isToggling || localLimit >= maxOverageLimit}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/10 text-black/60 transition-colors hover:bg-black/5 disabled:opacity-30 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* Estimated cost */}
              <div className="mt-3 flex items-center justify-between rounded-xl bg-black/[0.02] px-4 py-2.5 dark:bg-white/[0.02]">
                <span className="text-xs text-black/40 dark:text-white/40">
                  Costo máximo estimado
                </span>
                <span className="font-geist-mono text-sm font-medium text-black dark:text-white">
                  ${estimatedCost} USD
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
