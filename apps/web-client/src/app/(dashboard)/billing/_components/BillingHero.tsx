import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, CreditCard } from 'lucide-react';
import { useBillingMutations } from '@/hooks/useBilling';
import { SubscriptionPlan } from '@/app/_model/billing.dto';

import { toast } from 'sonner';

interface BillingHeroProps {
  plan: SubscriptionPlan;
  status: string;
  nextBillingDate: string | Date | null;
  credits: {
    available: number;
    usedThisMonth: number;
    limit: number;
  };
  allowOverages: boolean;
  maxOverageLimit?: number;
  currentOverageLimit?: number;
}

export default function BillingHero({ plan, status, nextBillingDate, credits, allowOverages, maxOverageLimit = 0, currentOverageLimit = 0 }: BillingHeroProps) {
  const { toggleOverages } = useBillingMutations();
  const [isToggling, setIsToggling] = useState(false);
  const [localLimit, setLocalLimit] = useState(currentOverageLimit);

  // Update local limit if prop changes (e.g. after API refresh)
  if (currentOverageLimit !== localLimit && !isToggling) {
     // This might cause loop if not careful, but basic sync. 
     // Better handling: use useEffect or just init state. 
     // For now, let's trust simple state init and key prop in parent or similar, 
     // or just useEffect.
  }

  const handleLimitChange = async (newLimit: number) => {
    try {
      setIsToggling(true);
      await toggleOverages.mutateAsync({ allowOverages: true, overageLimit: newLimit });
      toast.success('Límite de excedentes actualizado');
    } catch (error: any) {
        toast.error('Error al actualizar límite', { description: error.message });
    } finally {
        setIsToggling(false);
    }
  };

  const handleToggleOverages = async () => {
    try {
      setIsToggling(true);
      await toggleOverages.mutateAsync({ allowOverages: !allowOverages, overageLimit: localLimit });
      toast.success(`Excedentes ${!allowOverages ? 'habilitados' : 'deshabilitados'} correctamente`);
    } catch (error: any) {
      console.error('Failed to toggle overages', error);
      
      // Extract error message
      // Extract error message with multiple fallbacks
      const message = 
        error?.response?.data?.message || 
        error?.message || 
        (typeof error === 'string' ? error : 'Error desconocido');
      
      // Check for specific error code or message content
      if (message.includes('No active subscription found') || error?.errorCode === 'HTTP_ERROR') {
          toast.error('No tienes una suscripción activa', {
              description: 'Debes tener un plan activo para habilitar excedentes.'
          });
      } else {
          toast.error('Error al cambiar configuración', {
              description: message
          });
      }
    } finally {
      setIsToggling(false);
    }
  };
  const isNegative = credits.available < 0;
  const formattedBalance = Math.abs(credits.available).toLocaleString();
  const nextDateFormatted = nextBillingDate ? new Date(nextBillingDate).toLocaleDateString() : 'N/A';

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
        return { label: 'Activo', color: 'bg-emerald-500', text: 'text-emerald-300 dark:text-emerald-400', bg: 'bg-emerald-500/20' };
      case 'PAST_DUE':
      case 'past_due':
        return { label: 'Pago Pendiente', color: 'bg-red-500', text: 'text-red-300 dark:text-red-400', bg: 'bg-red-500/20' };
      case 'CANCELED':
      case 'canceled':
        return { label: 'Cancelado', color: 'bg-gray-500', text: 'text-gray-300 dark:text-gray-400', bg: 'bg-gray-500/20' };
      default:
        return { label: s, color: 'bg-gray-500', text: 'text-gray-300 dark:text-gray-400', bg: 'bg-gray-500/20' };
    }
  };

  const statusConfig = getStatusConfig(status);

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
                {isNegative ? '-' : ''}{formattedBalance}
             </motion.span>
             <span className="text-xl font-medium opacity-40">créditos</span>
          </div>

           {/* Negative Balance Helper Text */}
           {isNegative && (
               <p className="max-w-md text-sm text-red-600/80 dark:text-red-500/80">
                   Has excedido tu límite. El consumo extra ($0.19/crédito) se cargará en tu próxima factura.
               </p>
           )}

           {/* Overages Toggle */}
           <div className="mt-4 flex items-center gap-3">
              <button 
                onClick={handleToggleOverages}
                disabled={isToggling}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-black ${allowOverages ? 'bg-emerald-500' : 'bg-gray-700 dark:bg-gray-200'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${allowOverages ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
             <div className="flex flex-col">
                  <span className="text-sm font-medium text-white/90 dark:text-black/90">Permitir Excedentes</span>
                  <span className="text-xs text-white/50 dark:text-black/50">
                    {allowOverages ? 'El consumo extra se cobrará automáticamente.' : 'Los workflows se detendrán al agotar créditos.'}
                  </span>
              </div>
           </div>

           {/* Overage Limit Slider */}
           {allowOverages && maxOverageLimit > 0 && (
               <motion.div 
                 initial={{ opacity: 0, height: 0 }}
                 animate={{ opacity: 1, height: 'auto' }}
                 className="mt-6 space-y-3 rounded-2xl bg-white/5 p-4 backdrop-blur-sm dark:bg-black/5"
               >
                   <div className="flex justify-between text-sm">
                       <span className="font-medium opacity-80">Límite de Gasto Extra</span>
                       <span className="font-bold">{localLimit} Creditos</span>
                   </div>
                   
                   <input 
                      type="range"
                      min="0"
                      max={maxOverageLimit}
                      step="5"
                      // Use local state for smooth sliding
                      value={localLimit} 
                      onChange={(e) => setLocalLimit(Number(e.target.value))}
                      // Commit change on release
                      onMouseUp={(e) => handleLimitChange(Number(e.currentTarget.value))}
                      onTouchEnd={(e) => handleLimitChange(Number(e.currentTarget.value))}
                      className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-white/20 accent-emerald-500 dark:bg-black/20"
                   />
                   
                   <div className="flex justify-between text-xs opacity-50">
                       <span>0</span>
                       <span>Máx: {maxOverageLimit}</span>
                   </div>
               </motion.div>
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
                    <p className="text-xs font-medium uppercase tracking-wider opacity-50">{getPlanLabel(plan)}</p>
                </div>
             </div>

             {/* Billing Info */}
             <div className="space-y-1">
                 <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest ${statusConfig.bg} ${statusConfig.text}`}>
                     <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.color} animate-pulse`} />
                     {statusConfig.label}
                 </div>

                 {(status === 'PAST_DUE' || status === 'past_due') && (
                     <p className="max-w-[200px] text-right text-xs text-red-400 dark:text-red-300">
                         No pudimos procesar tu último pago. Por favor actualiza tu método de pago para evitar interrupciones.
                     </p>
                 )}
                 
                 {nextBillingDate && (
                    <div className="flex items-center gap-2 text-sm opacity-50 lg:justify-end">
                        <Shield size={14} />
                        <span>Renueva el {nextDateFormatted}</span>
                    </div>
                 )}
             </div>
        </div>
      </div>
    </div>
  );
}
