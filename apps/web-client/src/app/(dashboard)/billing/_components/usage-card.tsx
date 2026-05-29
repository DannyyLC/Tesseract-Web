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
    <div className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 transition-shadow hover:shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        {/* Icon Wrapper - Monochrome */}
        <div className="rounded-xl bg-surface-secondary p-2.5 text-text-primary">
          {React.isValidElement(icon)
            ? React.cloneElement(icon as React.ReactElement, { size: 20, className: '' })
            : icon}
        </div>

        {/* Unlimited Badge */}
        {isUnlimited && (
          <span className="rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs font-medium text-text-tertiary">
            Ilimitado
          </span>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-text-secondary">{title}</h3>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="font-geist-mono text-3xl font-light tracking-tight text-text-primary">
            {used.toLocaleString()}
          </span>
          {!isUnlimited && (
            <span className="text-sm text-text-tertiary">
              / {limit.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar - Monochrome */}
      {!isUnlimited ? (
        <div className="mt-4 space-y-2">
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-secondary">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full rounded-full bg-accent"
            />
          </div>
        </div>
      ) : (
        <div className="mt-4 h-1 w-full" /> // Spacer to keep height consistent
      )}
    </div>
  );
}
