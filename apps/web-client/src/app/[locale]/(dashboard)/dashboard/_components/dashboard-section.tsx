'use client';

import { ArrowUpRight } from 'lucide-react';
import { Link } from '@/i18n/routing';

/** Encabezado de las tarjetas del dashboard, con enlace opcional a la sección completa. */
export function SectionTitle({
  children,
  href,
  linkLabel,
}: {
  children: React.ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border p-5">
      <h2 className="text-lg font-semibold text-text-primary">{children}</h2>
      {href && (
        <Link
          href={href}
          className="flex items-center gap-1 text-sm text-black/50 transition-colors hover:text-text-primary"
        >
          {linkLabel}
          <ArrowUpRight size={14} />
        </Link>
      )}
    </div>
  );
}

/** Placeholder de una gráfica mientras carga. */
export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="w-full animate-pulse rounded-xl bg-surface-secondary" style={{ height }} />
  );
}
