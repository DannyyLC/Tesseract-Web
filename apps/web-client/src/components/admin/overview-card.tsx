'use client';

import type { ReactNode } from 'react';

/**
 * Tarjeta de número de los listados del admin: un número grande con su contexto debajo.
 *
 * Con `onClick` es un filtro (seleccionada se marca solo con un borde más gris); sin él es solo
 * informativa y no reacciona al mouse. `textValue` es para valores que son un nombre (un modelo,
 * una integración) y no caben al tamaño de un número.
 */
export function OverviewCard({
  label,
  value,
  hint,
  color,
  active = false,
  onClick,
  textValue = false,
}: {
  label: string;
  value: string;
  hint: ReactNode;
  color?: string;
  active?: boolean;
  onClick?: () => void;
  textValue?: boolean;
}) {
  const content = (
    <>
      <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {label}
      </span>
      <span
        className={`font-geist-mono mt-2 font-light tracking-tight ${
          textValue ? 'truncate text-xl leading-9' : 'text-3xl'
        } ${color ? '' : 'text-text-primary'}`}
        style={color ? { color } : undefined}
        title={textValue ? value : undefined}
      >
        {value}
      </span>
      <span className="mt-1 text-xs text-text-tertiary">{hint}</span>
    </>
  );

  if (!onClick) {
    return (
      <div className="flex min-w-0 flex-col rounded-2xl border border-border p-5">{content}</div>
    );
  }

  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-w-0 flex-col rounded-2xl border p-5 text-left transition-colors hover:bg-[var(--surface-tint)] ${
        active ? 'border-[var(--border-hover)]' : 'border-border'
      }`}
    >
      {content}
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
