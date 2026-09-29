'use client';

import { useTranslations } from 'next-intl';
import { DatasetUsageDto } from '@tesseract/types';

/**
 * Encabezado de la sección de filas: cuántas tiene ESTE catálogo y, debajo, cuánto suman todos
 * los catálogos contra el límite del plan.
 *
 * Antes eran "18 filas" en el título y "Filas: 26 / 15000" en un recuadro aparte, y no se leía que
 * el segundo número es de la organización entera. Cada número va ahora con su sujeto en la frase.
 * El consumo se queda a la vista: un botón deshabilitado sin explicación es peor que el límite.
 */

interface RowsSummaryProps {
  /** Filas de la consulta actual: el catálogo completo, o las coincidencias si hay filtros. */
  count: number;
  filtered: boolean;
  usage?: DatasetUsageDto;
  /** Texto del aviso cuando se llegó al límite; cada vista tiene su redacción. */
  blockedLabel: string;
  headingClassName?: string;
}

export function RowsSummary({
  count,
  filtered,
  usage,
  blockedLabel,
  headingClassName = 'font-semibold text-text-primary',
}: RowsSummaryProps) {
  const t = useTranslations('Datasets');

  return (
    <div className="min-w-0 space-y-1">
      <h2 className={headingClassName}>
        {filtered ? t('rowsHeadingFiltered', { count }) : t('rowsHeading', { count })}
      </h2>

      {usage && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
          {usage.maxDatasetRows === -1
            ? t('rowsUsageUnlimited', { used: usage.rows })
            : t('rowsUsageTotal', { used: usage.rows, max: usage.maxDatasetRows })}
          {usage.writesBlocked && (
            <span className="bg-warning-500/10 rounded-lg px-2 py-0.5 font-medium text-warning-600">
              {blockedLabel}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
