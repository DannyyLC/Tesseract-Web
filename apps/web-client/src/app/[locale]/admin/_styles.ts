/**
 * Clases compartidas del área de super admin. Estaban duplicadas al inicio de cada
 * página; viven aquí para que una pantalla nueva se vea igual sin copiarlas.
 *
 * Siguen el lenguaje del panel de usuario: controles `rounded-xl`, secciones `rounded-2xl`
 * solo con borde (sin fondo gris), filas transparentes que se enmarcan al pasar el mouse y
 * buscadores/filtros en píldora.
 */
export const inputClass =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent';

/** Disparador de `InfiniteSelect` dentro de un formulario: se ve igual que `inputClass`. */
export const selectTriggerClass =
  'flex w-full items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent';

export const labelClass = 'mb-1 block text-xs font-medium text-text-secondary';

export const btnPrimary =
  'inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-50';

export const btnGhost =
  'inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-[var(--surface-tint)] hover:text-text-primary disabled:opacity-50';

/** Acción destructiva secundaria (desactivar, vaciar…): contorno neutro, texto en danger. */
export const btnDangerGhost =
  'inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-danger-600 transition-colors hover:bg-[var(--danger-tint-hover)] disabled:opacity-50';

/** Confirmación destructiva dentro de un modal. */
export const btnDanger =
  'inline-flex items-center gap-2 rounded-xl bg-danger-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50';

/** Botón de solo icono (editar, borrar, más opciones). */
export const iconBtn =
  'rounded-xl p-2 text-text-secondary transition-colors hover:bg-[var(--surface-tint)] hover:text-text-primary disabled:opacity-40';

export const iconBtnDanger =
  'rounded-xl p-2 text-text-secondary transition-colors hover:bg-[var(--danger-tint-hover)] hover:text-danger-600 disabled:opacity-40';

/** Para prompts y JSON: monoespaciada y con tabulación corta, que el texto ya es denso. */
export const monoClass =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-text-primary outline-none transition-colors focus:border-accent';

/* ─── Encabezado de página ──────────────────────────────────────────────────── */

export const pageTitleClass = 'text-2xl font-bold text-text-primary';
export const pageSubtitleClass = 'mt-1 text-sm text-text-secondary';

/* ─── Secciones y filas ─────────────────────────────────────────────────────── */

/** Sección agrupadora: solo borde, sin fondo — como las secciones de Perfil. */
export const sectionClass = 'rounded-2xl border border-border';
export const sectionTitleClass = 'text-base font-semibold text-text-primary';

/** Fila de listado: transparente en reposo y enmarcada al pasar el mouse (Contactos, Workflows). */
export const rowClass =
  'rounded-xl border border-transparent transition-all duration-200 hover:border-border hover:bg-surface-panel hover:shadow-sm';

/** Acción dentro de una fila (Publicar, Templates…): píldora con contorno, como en Contactos. */
export const rowActionClass =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-[var(--surface-tint)] hover:text-text-primary disabled:opacity-50';

/** Fila que se queda enmarcada (expandida o seleccionada). */
export const rowActiveClass = 'rounded-xl border border-border bg-surface-panel shadow-sm';

/** Estado vacío / sin resultados de un listado. */
export const emptyClass =
  'rounded-2xl border border-dashed border-border px-4 py-16 text-center text-sm text-text-secondary';

/* ─── Búsqueda y filtros ────────────────────────────────────────────────────── */

export const searchClass =
  'w-full rounded-full border-none bg-[var(--surface-tint)] py-2 pl-10 pr-4 text-sm text-text-primary transition-all placeholder:text-input-placeholder hover:bg-[var(--surface-tint-md)] focus:outline-none focus:ring-2 focus:ring-[var(--border-subtle)]';
export const searchIconClass =
  'pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary';

/** Disparador de selects en la barra de filtros (misma píldora que el buscador). */
export const filterSelectClass =
  'flex w-full items-center justify-between rounded-full border-none bg-[var(--surface-tint)] px-4 py-2 text-sm text-text-primary outline-none transition-all hover:bg-[var(--surface-tint-md)] focus:ring-2 focus:ring-[var(--border-subtle)]';

/** Filtro segmentado en píldora (Todos / Activos / …), como el de Contactos. */
export const segmentedTrackClass =
  'flex shrink-0 items-center gap-1 rounded-full bg-[var(--surface-tint)] p-1';
export const segmentedItemClass = (active: boolean) =>
  `rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
    active
      ? 'bg-surface-elevated text-text-primary shadow-sm'
      : 'text-text-tertiary hover:text-text-secondary'
  }`;

/** Pestañas de una pantalla de detalle, como el selector de Integraciones. */
export const tabsTrackClass =
  'flex w-full gap-1 overflow-x-auto rounded-2xl bg-[var(--surface-tint)] p-1 sm:w-fit';
export const tabItemClass = (active: boolean) =>
  `inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all ${
    active
      ? 'bg-surface-elevated text-text-primary shadow-sm'
      : 'text-text-secondary hover:text-text-primary'
  }`;

/** Barra fija superior de las pantallas de detalle, como el top bar del panel de usuario. */
export const stickyHeaderClass =
  'bg-surface/80 sticky top-14 z-20 -mx-4 -mt-4 mb-6 border-b border-border backdrop-blur-xl md:-mx-6 md:-mt-6 lg:top-0 lg:-mx-8 lg:-mt-8';

/** Aviso de error (referencias rotas, validación): banner danger del panel de usuario. */
export const dangerBannerClass =
  'rounded-xl border border-[var(--danger-banner-border)] bg-[var(--danger-banner-bg)] px-4 py-3 text-sm text-[var(--danger-text-adaptive)]';

/** Aviso de advertencia. */
export const warningBannerClass =
  'rounded-xl bg-[var(--badge-warning-bg-solid)] px-4 py-3 text-sm text-[var(--badge-warning-text-solid)]';

/** Nota neutra (contexto, aclaraciones). */
export const noteClass =
  'rounded-xl bg-[var(--surface-tint)] px-4 py-3 text-xs text-text-secondary';

/** Bloque de código/diff en solo lectura. */
export const codeBlockClass =
  'overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--surface-tint)] p-2 font-mono text-[11px]';

/** Chip neutro (conteos, etiquetas técnicas). */
export const chipClass =
  'rounded-full bg-[var(--surface-tint)] px-2 py-0.5 text-xs text-text-secondary';
