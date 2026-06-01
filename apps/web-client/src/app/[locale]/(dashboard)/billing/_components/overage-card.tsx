import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import { useBillingMutations } from '@/hooks/billing/use-billing';
import { toast } from 'sonner';
import { OVERAGE_PRICE_PER_CREDIT } from '@tesseract/types';
import { useTranslations } from 'next-intl';

interface OverageCardProps {
  allowOverages: boolean;
  maxOverageLimit: number;
  currentOverageLimit: number;
}

const STEP = 5;
const DEBOUNCE_MS = 1200;

export default function OverageCard({
  allowOverages,
  maxOverageLimit,
  currentOverageLimit,
}: OverageCardProps) {
  const t = useTranslations('BillingOverage');
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
          toast.success(t('limitUpdated'));
        } catch (error: any) {
          if (!error.toastHandled) {
            toast.error(t('limitUpdateError'), { description: error.message });
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
      toast.success(!allowOverages ? t('overagesEnabled') : t('overagesDisabled'));
    } catch (error: any) {
      if (!error.toastHandled) {
        const message =
          error?.response?.data?.message ||
          error?.message ||
          (typeof error === 'string' ? error : 'Error desconocido');

        if (message.includes('No active subscription found') || error?.errorCode === 'HTTP_ERROR') {
          toast.error(t('noSubscription'), {
            description: t('noSubscriptionDesc'),
          });
        } else {
          toast.error(t('toggleError'), { description: message });
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

  const estimatedCost = (localLimit * OVERAGE_PRICE_PER_CREDIT).toFixed(2);

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 transition-shadow hover:shadow-sm">
      {/* Header — toggle + label, always visible */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-text-primary">{t('heading')}</h3>
          <p className="text-xs text-text-secondary">
            {allowOverages
              ? t('enabledDesc', { price: OVERAGE_PRICE_PER_CREDIT })
              : t('disabledDesc')}
          </p>
        </div>

        {/* Toggle switch */}
        <button
          onClick={handleToggle}
          disabled={isToggling}
          title={allowOverages ? t('deactivateTitle') : t('activateTitle')}
          aria-label={allowOverages ? t('deactivateTitle') : t('activateTitle')}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-border-focus/20 focus:ring-offset-2 focus:ring-offset-surface disabled:opacity-50 ${
            allowOverages ? 'bg-accent' : 'bg-border-hover'
          }`}
        >
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="inline-block h-4 w-4 rounded-full bg-surface-elevated shadow-sm"
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
            <div className="mt-5 border-t border-border pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {t('limitHeading')}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {t('maxCredits', { max: maxOverageLimit.toLocaleString() })}
                  </p>
                </div>

                {/* Numeric stepper */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => debouncedCommit(localLimit - STEP)}
                    disabled={isToggling || localLimit <= 0}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-30"
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
                    className="font-geist-mono h-9 w-24 rounded-xl border border-border bg-transparent px-3 text-center text-sm font-medium tabular-nums text-text-primary focus:border-border-hover focus:outline-none disabled:opacity-50"
                  />

                  <button
                    onClick={() => debouncedCommit(localLimit + STEP)}
                    disabled={isToggling || localLimit >= maxOverageLimit}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-30"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* Estimated cost */}
              <div className="mt-3 flex items-center justify-between rounded-xl bg-surface-muted px-4 py-2.5">
                <span className="text-xs text-text-tertiary">
                  {t('estimatedCost')}
                </span>
                <span className="font-geist-mono text-sm font-medium text-text-primary">
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
