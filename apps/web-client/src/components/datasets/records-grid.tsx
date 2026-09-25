'use client';

import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Plus, Sigma } from 'lucide-react';
import { DatasetField, DatasetRecordDto } from '@tesseract/types';
import { Checkbox } from '@/components/ui/checkbox';
import { RecordsSelection } from './use-record-selection';

/**
 * Rejilla de captura generada desde el schema.
 *
 * El editor de cada celda sale del tipo de la columna: un `select` es un desplegable con las
 * opciones declaradas, un `number` es un campo numérico, una `date` es un date picker sin hora.
 * Es la misma regla que rige toda la funcionalidad — el tipo decide lo que se puede hacer con la
 * columna, aquí en la UI y allá en la firma de la tool.
 *
 * Una columna con fórmula no se captura: se muestra su valor y ya. El cálculo ocurre en el Gateway
 * al guardar la fila, así que el valor nuevo aparece cuando la fila vuelve del servidor.
 *
 * Las celdas recortan el texto largo. Para leerlo completo, la flecha del final abre un panel
 * debajo de la fila con cada columna en su propio renglón; solo una fila a la vez, como la vista
 * de resultados de BigQuery. Editar una fila abre ese mismo panel y los editores viven ahí, con
 * un `textarea` que crece para las columnas de texto: en un `input` de una línea había que
 * recorrer el valor con el cursor para ver lo que se estaba escribiendo.
 *
 * El borrado no vive aquí. Se marcan filas con la casilla de la izquierda y se borran desde la
 * barra de la página, con confirmación: un botón de papelera por fila borraba al primer clic, sin
 * red, y obligaba a repetirlo una vez por fila.
 */

interface RecordsGridProps {
  fields: DatasetField[];
  records: DatasetRecordDto[];
  readOnly?: boolean;
  /**
   * Cuando viene con texto, deshabilita SOLO el botón de agregar fila (no editar) y lo usa como
   * tooltip. Es el límite de filas del plan: las filas que ya existen se siguen pudiendo editar y
   * borrar libremente, lo único que se bloquea es crecer más.
   */
  createDisabledReason?: string;
  /** Si viene y no es `readOnly`, la rejilla pinta la columna de casillas. */
  selection?: RecordsSelection;
  onCreate: (data: Record<string, unknown>) => Promise<void>;
  onUpdate: (recordId: string, data: Record<string, unknown>) => Promise<void>;
}

type RowDraft = Record<string, string>;

/**
 * Ancho máximo de una celda de datos. Un valor largo se recorta con puntos suspensivos en vez de
 * estirar la columna: es lo que evita que la tabla se haga más ancha que su recuadro y aparezca
 * el scroll horizontal. El valor completo se lee en el panel que abre la flecha de la fila.
 */
const CELL_MAX_WIDTH = 'max-w-[12rem]';

/**
 * Las columnas calculadas se quedan fuera del borrador: su valor lo pone la fórmula al guardar.
 * El servidor las ignora de todos modos, pero mandarlas sería decir que se pueden capturar.
 */
const toDraft = (fields: DatasetField[], record?: DatasetRecordDto): RowDraft =>
  Object.fromEntries(
    fields
      .filter((field) => !field.formula)
      .map((field) => [
        field.key,
        record?.data?.[field.key] != null ? String(record.data[field.key]) : '',
      ]),
  );

const displayValue = (value: unknown): string =>
  value != null && value !== '' ? String(value) : '—';

/** `textarea` que crece con su contenido, para no tener que desplazarse dentro de él. */
function AutoGrowTextarea({
  value,
  onChange,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  className: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
      className={`${className} resize-none overflow-hidden`}
    />
  );
}

export function RecordsGrid({
  fields,
  records,
  readOnly,
  createDisabledReason,
  selection,
  onCreate,
  onUpdate,
}: RecordsGridProps) {
  const t = useTranslations('Datasets');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RowDraft>({});
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const selectable = !!selection && !readOnly;
  const columnCount = fields.length + (selectable ? 1 : 0) + (readOnly ? 0 : 1) + 1;

  const startEdit = (record: DatasetRecordDto) => {
    setCreating(false);
    setEditingId(record.id);
    setExpandedId(record.id);
    setDraft(toDraft(fields, record));
    setError(null);
  };

  const startCreate = () => {
    setEditingId(null);
    setExpandedId(null);
    setCreating(true);
    setDraft(toDraft(fields));
    setError(null);
  };

  const cancel = () => {
    setEditingId(null);
    setCreating(false);
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);

    try {
      if (creating) {
        await onCreate(draft);
      } else if (editingId) {
        await onUpdate(editingId, draft);
      }
      cancel();
    } catch (caught) {
      // El backend valida contra el schema (un número mal escrito, una opción que no existe) y
      // ese mensaje es más útil que uno genérico: dice exactamente qué celda está mal.
      setError(caught instanceof Error ? caught.message : t('saveError'));
    } finally {
      setSaving(false);
    }
  };

  const renderEditor = (field: DatasetField, record?: DatasetRecordDto) => {
    const value = draft[field.key] ?? '';
    const onChange = (next: string) => setDraft((current) => ({ ...current, [field.key]: next }));
    const className =
      'w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text-primary outline-none focus:border-accent';

    // Una columna calculada no se edita: se muestra lo que hay y el valor nuevo aparece al guardar.
    if (field.formula) {
      const saved = record?.data?.[field.key];

      return (
        <span
          className="block px-2 py-1 text-sm text-text-tertiary"
          title={t('formulaReadonlyHint', { formula: field.formula })}
        >
          {saved != null ? String(saved) : '—'}
        </span>
      );
    }

    if (field.type === 'select') {
      return (
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={field.label}
          className={className}
        >
          <option value="">—</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === 'text') {
      return (
        <AutoGrowTextarea
          value={value}
          onChange={onChange}
          ariaLabel={field.label}
          className={className}
        />
      );
    }

    return (
      <input
        type={field.type === 'number' ? 'number' : 'date'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={field.label}
        className={className}
      />
    );
  };

  const isEditingRow = (id: string) => editingId === id;

  // Guardar y cancelar viven solo al pie del panel: repetirlos en la fila daba dos formas de
  // hacer lo mismo.
  const saveCancelButtons = (
    <div className="flex justify-end gap-2">
      <button
        onClick={cancel}
        className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-[var(--surface-tint)]"
      >
        {t('cancel')}
      </button>
      <button
        onClick={save}
        disabled={saving}
        className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-text-inverse disabled:opacity-50"
      >
        {t('save')}
      </button>
    </div>
  );

  /**
   * Panel a todo lo ancho bajo la fila: una columna por renglón, con el valor completo. Al
   * editar, cada renglón lleva su editor en lugar del valor.
   */
  const renderPanel = (editing: boolean, record?: DatasetRecordDto) => (
    <td colSpan={columnCount} className="px-4 pb-4 pt-1">
      <dl className="grid gap-x-6 gap-y-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-[minmax(8rem,14rem)_1fr]">
        {fields.map((field) => (
          <div key={field.key} className="contents">
            <dt className="flex items-center gap-1 pt-1 text-xs font-medium text-text-secondary">
              {field.label}
              {field.formula && (
                <Sigma
                  size={12}
                  className="text-text-tertiary"
                  aria-label={t('formulaCalculated')}
                />
              )}
            </dt>
            <dd className="min-w-0 text-sm text-text-primary">
              {editing ? (
                renderEditor(field, record)
              ) : (
                <span className="block whitespace-pre-wrap break-words pt-1">
                  {displayValue(record?.data?.[field.key])}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {editing && <div className="mt-3">{saveCancelButtons}</div>}
    </td>
  );

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-xl border border-[var(--danger-banner-border)] bg-[var(--danger-banner-bg)] px-4 py-3 text-sm text-[var(--danger-text-adaptive)]">
          {error}
        </div>
      )}

      {/* `overflow-x-auto` queda solo como red de seguridad para schemas con muchísimas columnas.
          En el caso normal la tabla cabe, porque las celdas recortan en vez de estirarse. */}
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-tint)]">
            <tr>
              {selectable && (
                <th className="w-px px-4 py-3">
                  <Checkbox
                    checked={selection.allVisibleSelected}
                    indeterminate={selection.someVisibleSelected && !selection.allVisibleSelected}
                    onChange={selection.toggleAllVisible}
                    disabled={records.length === 0}
                    aria-label={t('selectAllRows')}
                    title={t('selectionPageOnlyHint')}
                  />
                </th>
              )}

              {fields.map((field) => (
                <th
                  key={field.key}
                  className="whitespace-nowrap px-4 py-3 font-medium text-text-secondary"
                >
                  <span className="inline-flex items-center gap-1">
                    {field.label}
                    {field.formula && (
                      <Sigma
                        size={12}
                        className="text-text-tertiary"
                        aria-label={t('formulaCalculated')}
                      />
                    )}
                  </span>
                </th>
              ))}
              {!readOnly && <th className="w-px whitespace-nowrap px-4 py-3" />}
              <th className="w-px px-2 py-3" />
            </tr>
          </thead>

          <tbody>
            {records.map((record) => {
              const editing = isEditingRow(record.id);
              const expanded = expandedId === record.id;

              return (
                <Fragment key={record.id}>
                  <tr
                    className={`border-t border-border ${expanded ? 'bg-[var(--surface-tint)]' : ''}`}
                  >
                    {selectable && (
                      <td className="w-px px-4 py-2 align-middle">
                        <Checkbox
                          checked={selection.selectedIds.has(record.id)}
                          onChange={() => selection.toggle(record.id)}
                          // La fila abierta en el editor tiene cambios sin guardar: marcarla para
                          // borrarla en lote es pedir dos cosas contradictorias a la vez.
                          disabled={isEditingRow(record.id)}
                          aria-label={t('selectRow')}
                        />
                      </td>
                    )}

                    {fields.map((field) => {
                      // Mientras se edita, la fila refleja el borrador y los editores están en el
                      // panel de abajo. Las calculadas no están en el borrador: se queda lo guardado.
                      const value = displayValue(
                        editing && !field.formula ? draft[field.key] : record.data?.[field.key],
                      );

                      return (
                        <td key={field.key} className="px-4 py-2 align-middle text-text-primary">
                          <span className={`block truncate ${CELL_MAX_WIDTH}`} title={value}>
                            {value}
                          </span>
                        </td>
                      );
                    })}

                    {!readOnly && (
                      <td className="w-px whitespace-nowrap px-4 py-2 align-middle">
                        {!editing && (
                          <button
                            onClick={() => startEdit(record)}
                            className="rounded-lg px-2 py-1 text-xs font-medium text-text-secondary hover:bg-[var(--surface-tint)]"
                          >
                            {t('edit')}
                          </button>
                        )}
                      </td>
                    )}

                    <td className="w-px px-2 py-2 align-middle">
                      <button
                        onClick={() => setExpandedId(expanded ? null : record.id)}
                        // Mientras hay una fila en edición su panel se queda abierto: cerrarlo o abrir
                        // otro escondería los editores con cambios sin guardar.
                        disabled={editingId !== null}
                        aria-expanded={expanded}
                        aria-label={expanded ? t('collapseRow') : t('expandRow')}
                        className="rounded-lg p-1.5 text-text-tertiary hover:bg-[var(--surface-tint)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronDown
                          size={16}
                          className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                    </td>
                  </tr>

                  {expanded && (
                    <tr className="bg-[var(--surface-tint)]">{renderPanel(editing, record)}</tr>
                  )}
                </Fragment>
              );
            })}

            {creating && (
              <tr className="border-t border-border bg-[var(--surface-tint)]">
                {renderPanel(true)}
              </tr>
            )}

            {records.length === 0 && !creating && (
              <tr>
                <td
                  colSpan={columnCount}
                  className="px-4 py-10 text-center text-sm text-text-tertiary"
                >
                  {t('noRecords')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!readOnly && !creating && (
        <button
          onClick={startCreate}
          disabled={!!createDisabledReason}
          title={createDisabledReason}
          className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-accent hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-text-secondary"
        >
          <Plus size={16} />
          {t('addRow')}
        </button>
      )}
    </div>
  );
}
