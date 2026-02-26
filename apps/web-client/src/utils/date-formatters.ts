/**
 * Format date labels based on granularity for better chart readability
 */
export function formatDateByGranularity(
  date: string,
  granularity?: 'hour' | 'day' | 'week' | 'month'
): string {
  if (!granularity) return date;

  try {
    switch (granularity) {
      case 'hour':
        // "2026-02-02 12:00:00" → "12:00"
        const timePart = date.split(' ')[1];
        return timePart ? timePart.substring(0, 5) : date;

      case 'day':
        // "2026-02-02" → "Feb 2"
        // Prevent timezone shift: Parse parts manually to create local date
        // new Date("2026-01-19") is UTC midnight -> Jan 18th in EST/CST/PST
        const [y, m, d] = date.split('-').map(Number);
        const localDate = new Date(y, m - 1, d);
        return localDate.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });

      case 'week':
        // "2026-W05" → "Sem 5"
        const weekNum = date.split('-W')[1];
        return weekNum ? `Sem ${weekNum}` : date;

      case 'month':
        // "2026-02" → "Feb 2026"
        const [year, month] = date.split('-');
        if (year && month) {
          const monthDate = new Date(parseInt(year), parseInt(month) - 1);
          return monthDate.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
        }
        return date;

      default:
        return date;
    }
  } catch (error) {
    // Fallback to original date if parsing fails
    return date;
  }
}

/**
 * Get human-readable label for granularity
 */
export function getGranularityLabel(granularity: 'hour' | 'day' | 'week' | 'month'): string {
  const labels = {
    hour: 'Por hora',
    day: 'Por día',
    week: 'Por semana',
    month: 'Por mes',
  };
  return labels[granularity];
}
