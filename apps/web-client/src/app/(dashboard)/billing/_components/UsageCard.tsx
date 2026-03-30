import React from 'react';
import { motion } from 'framer-motion';

interface UsageCardProps {
  title: string;
  icon: React.ReactNode;
  used: number;
  limit: number;
  unit: string;
}

export default function UsageCard({ title, icon, used, limit, unit }: UsageCardProps) {
  const isUnlimited = limit === -1;
  const percentage = isUnlimited ? 0 : Math.min((used / limit) * 100, 100);

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-black/5 bg-white p-5 transition-shadow hover:shadow-sm dark:border-white/5 dark:bg-[#0A0A0A]">
      <div className="mb-4 flex items-center justify-between">
        {/* Icon Wrapper - Monochrome */}
        <div className="rounded-xl bg-black/5 p-2.5 text-black dark:bg-white/5 dark:text-white">
          {React.isValidElement(icon)
            ? React.cloneElement(icon as React.ReactElement, { size: 20, className: '' })
            : icon}
        </div>

        {/* Unlimited Badge */}
        {isUnlimited && (
          <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-medium text-black/60 dark:bg-white/5 dark:text-white/60">
            Ilimitado
          </span>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-black/50 dark:text-white/50">{title}</h3>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="font-geist-mono text-3xl font-light tracking-tight text-black dark:text-white">
            {used.toLocaleString()}
          </span>
          {!isUnlimited && (
            <span className="text-sm text-black/30 dark:text-white/30">
              / {limit.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar - Monochrome */}
      {!isUnlimited ? (
        <div className="mt-4 space-y-2">
          <div className="h-1 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/5">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full rounded-full bg-black dark:bg-white"
            />
          </div>
        </div>
      ) : (
        <div className="mt-4 h-1 w-full" /> // Spacer to keep height consistent
      )}
    </div>
  );
}
