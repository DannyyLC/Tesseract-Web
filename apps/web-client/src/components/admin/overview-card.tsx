'use client';

import type { ReactNode } from 'react';

/**
 * Tarjeta de número de los listados del admin (organizaciones, workflows): un número grande con
 * su contexto debajo y un filtro detrás. Seleccionada se marca solo con un borde más gris.
 */
export function OverviewCard({
  label,
  value,
  hint,
  color,
  active,
  onClick,
}: {
  label: string;
  value: string;
  hint: ReactNode;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col rounded-2xl border p-5 text-left transition-colors hover:bg-[var(--surface-tint)] ${
        active ? 'border-[var(--border-hover)]' : 'border-border'
      }`}
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {label}
      </span>
      <span
        className={`font-geist-mono mt-2 text-3xl font-light tracking-tight ${color ? '' : 'text-text-primary'}`}
        style={color ? { color } : undefined}
      >
        {value}
      </span>
      <span className="mt-1 text-xs text-text-tertiary">{hint}</span>
    </button>
  );
}

/** Placeholder del mismo alto que las tarjetas, para que el listado no salte al cargar. */
export function OverviewCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-[132px] animate-pulse rounded-2xl border border-border" />
      ))}
    </div>
  );
}
