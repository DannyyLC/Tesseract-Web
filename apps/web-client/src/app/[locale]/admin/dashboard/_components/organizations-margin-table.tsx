import { Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import type { AdminAnalyticsOrgMarginRow } from '@/lib/api/endpoints/billing/analytics-admin-api';
import { formatPct, formatUSD } from './format';

interface Props {
  items: AdminAnalyticsOrgMarginRow[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * Ranking de organizaciones por margen (costo real vs. lo cobrado), peores primero — el punto de
 * partida para detectar un plan mal calibrado antes de que se note en la cuenta de resultados.
 */
export function OrganizationsMarginTable({ items, page, totalPages, onPageChange }: Props) {
  return (
    <section className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border p-4">
        <h3 className="text-sm font-semibold text-text-primary">Margen por organización</h3>
        <p className="mt-1 text-xs text-text-secondary">Peores márgenes primero.</p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center text-text-tertiary">
          <Building2 size={24} className="opacity-40" />
          <p className="mt-3 text-sm">Sin organizaciones con ejecuciones en el rango.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((row) => (
            <li key={row.organizationId} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <Link
                  href={`/admin/organizaciones/${row.organizationId}`}
                  className="truncate text-sm text-text-primary hover:underline"
                >
                  {row.organizationName}
                </Link>
                <p className="text-xs text-text-secondary">
                  {row.plan} · {row.executions} ejecuciones · costo {formatUSD(row.costUSD)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={`text-sm font-medium ${
                    row.marginUSD == null ? 'text-text-secondary' : row.marginUSD >= 0 ? 'text-success-500' : 'text-danger'
                  }`}
                >
                  {row.marginUSD != null ? formatUSD(row.marginUSD) : 'Sin precio'}
                </p>
                <p className="text-xs text-text-secondary">{formatPct(row.marginPct)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 border-t border-border p-3">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={14} /> Anterior
          </button>
          <span className="text-xs text-text-secondary">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Siguiente <ChevronRight size={14} />
          </button>
        </div>
      )}
    </section>
  );
}
