/**
 * Clases compartidas del área de super admin. Estaban duplicadas al inicio de cada
 * página; viven aquí para que una pantalla nueva se vea igual sin copiarlas.
 */
export const inputClass =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border-focus';

export const labelClass = 'mb-1 block text-xs font-medium text-text-secondary';

export const btnPrimary =
  'inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50';

export const btnGhost =
  'inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-text-primary transition-colors hover:bg-surface-secondary disabled:opacity-50';

/** Para prompts y JSON: monoespaciada y con tabulación corta, que el texto ya es denso. */
export const monoClass =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-text-primary outline-none focus:border-border-focus';
