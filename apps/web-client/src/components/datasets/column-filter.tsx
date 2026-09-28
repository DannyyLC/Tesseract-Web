'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Filter } from 'lucide-react';
import { DatasetField } from '@tesseract/types';
import { Checkbox } from '@/components/ui/checkbox';
import { isFilterActive, RangeDraft, RecordFiltersState } from './use-record-filters';

/**
 * Embudo en el encabezado de una columna que abre su filtro.
 *
 * El filtro vive en la columna y no en una barra aparte porque escala con el schema: un catálogo
 * de 30 columnas llenaría la barra de botones, y en el encabezado cada filtro está justo encima
 * de los valores que recorta. Un `select` se filtra marcando opciones (O entre ellas), un
 * `number` o una `date` por rango.
 *
 * Lo que se marca o teclea es un borrador local: la tabla solo se consulta al pulsar "Aplicar"
 * (o Enter). Aplicar cada casilla al vuelo recargaba la tabla una vez por opción marcada.
 * Cerrar el panel sin aplicar descarta el borrador.
 *
 * El panel va en un portal con posición fija, igual que `PageSizeSelect`: la tabla tiene
 * `overflow-x-auto` y lo recortaría.
 */

const GAP = 4;
const PANEL_WIDTH = 240;

interface ColumnFilterProps {
  field: DatasetField;
  state: RecordFiltersState;
}

export function ColumnFilter({ field, state }: ColumnFilterProps) {
  const t = useTranslations('Datasets');
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [draftSelect, setDraftSelect] = useState<string[]>([]);
  const [draftRange, setDraftRange] = useState<RangeDraft>({});

  const active = isFilterActive(state.filters, field.key);
  const close = useCallback(() => setIsOpen(false), []);

  const open = () => {
    // Cada apertura parte de lo aplicado, no de un borrador que se cerró sin aplicar.
    setDraftSelect(state.filters.select[field.key] ?? []);
    setDraftRange(state.filters.range[field.key] ?? {});
    setIsOpen(true);
  };

  const apply = () => {
    if (field.type === 'select') state.setSelect(field.key, draftSelect);
    else state.setRange(field.key, draftRange);
    close();
  };

  const clear = () => {
    state.clearField(field.key);
    close();
  };

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // Alineado al embudo, pero sin salirse de la ventana en las columnas de la derecha.
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8));
    setPosition({ left, top: rect.bottom + GAP });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        triggerRef.current?.focus();
      }
    };

    // Con posición fija, el panel se quedaría flotando si la página se desplaza; el scroll de la
    // propia lista de opciones no cuenta.
    const handleScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      close();
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [isOpen, close]);

  const label = t('filterColumn', { column: field.label });
  const inputClassName =
    'w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text-primary outline-none focus:border-accent';

  const renderBody = () => {
    if (field.type === 'select') {
      const selected = draftSelect;
      const toggle = (option: string, checked: boolean) =>
        setDraftSelect(
          checked ? [...selected, option] : selected.filter((value) => value !== option),
        );

      return (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {(field.options ?? []).map((option) => (
            <li key={option}>
              {/* `Checkbox` ya es un `<label>`: el texto va en un botón al lado en vez de envolverla. */}
              <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text-primary hover:bg-surface-secondary">
                <Checkbox
                  checked={selected.includes(option)}
                  onChange={(checked) => toggle(option, checked)}
                  aria-label={option}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => toggle(option, !selected.includes(option))}
                  className="min-w-0 flex-1 truncate text-left"
                >
                  {option}
                </button>
              </div>
            </li>
          ))}
        </ul>
      );
    }

    const range = draftRange;
    const type = field.type === 'number' ? 'number' : 'date';

    return (
      <form
        className="grid gap-2 px-2"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <label className="grid gap-1 text-xs text-text-secondary">
          {t('filterMin')}
          <input
            type={type}
            value={range.min ?? ''}
            onChange={(event) => setDraftRange({ ...range, min: event.target.value })}
            className={inputClassName}
          />
        </label>
        <label className="grid gap-1 text-xs text-text-secondary">
          {t('filterMax')}
          <input
            type={type}
            value={range.max ?? ''}
            onChange={(event) => setDraftRange({ ...range, max: event.target.value })}
            className={inputClassName}
          />
        </label>
        {/* Enter dentro de "Desde"/"Hasta" aplica, como en cualquier formulario. */}
        <button type="submit" hidden />
      </form>
    );
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={label}
        title={label}
        onClick={() => (isOpen ? close() : open())}
        className={`rounded-md p-1 transition-colors hover:bg-surface-secondary ${
          active ? 'text-accent' : 'text-text-tertiary'
        }`}
      >
        <Filter size={12} fill={active ? 'currentColor' : 'none'} />
      </button>

      {isOpen &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={label}
            style={{ left: position.left, top: position.top, width: PANEL_WIDTH }}
            className="fixed z-[200] space-y-2 rounded-xl border border-border bg-surface-elevated py-2 font-normal shadow-lg"
          >
            <p className="px-3 text-xs font-medium text-text-secondary">{field.label}</p>
            <div className="px-1">{renderBody()}</div>
            <div className="flex items-center justify-between gap-2 border-t border-border px-2 pt-2">
              {active ? (
                <button
                  type="button"
                  onClick={clear}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-text-secondary hover:bg-[var(--surface-tint)]"
                >
                  {t('filterClear')}
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={apply}
                className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-text-inverse"
              >
                {t('filterApply')}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
