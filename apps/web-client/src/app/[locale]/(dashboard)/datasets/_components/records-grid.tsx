'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Plus, Sigma, Trash2, X } from 'lucide-react';
import { DatasetField, DatasetRecordDto } from '@tesseract/types';

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
 */

interface RecordsGridProps {
  fields: DatasetField[];
  records: DatasetRecordDto[];
  readOnly?: boolean;
  onCreate: (data: Record<string, unknown>) => Promise<void>;
  onUpdate: (recordId: string, data: Record<string, unknown>) => Promise<void>;
  onDelete: (recordId: string) => Promise<void>;
}

type RowDraft = Record<string, string>;

/**
 * Ancho máximo de una celda de datos. Un valor largo se recorta con puntos suspensivos en vez de
 * estirar la columna: es lo que evita que la tabla se haga más ancha que su recuadro y aparezca
 * el scroll horizontal. El valor completo queda en el `title` y en el editor al abrir la fila.
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

export function RecordsGrid({
  fields,
  records,
  readOnly,
  onCreate,
  onUpdate,
  onDelete,
}: RecordsGridProps) {
  const t = useTranslations('Datasets');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RowDraft>({});
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = (record: DatasetRecordDto) => {
    setCreating(false);
    setEditingId(record.id);
    setDraft(toDraft(fields, record));
    setError(null);
  };

  const startCreate = () => {
    setEditingId(null);
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
      'w-full min-w-[8rem] rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text-primary outline-none focus:border-accent';

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
        <select value={value} onChange={(event) => onChange(event.target.value)} className={className}>
          <option value="">—</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={className}
      />
    );
  };

  const isEditingRow = (id: string) => editingId === id;

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-danger/10 rounded-xl px-4 py-3 text-sm text-danger-600">{error}</div>
      )}

      {/* `overflow-x-auto` queda solo como red de seguridad para schemas con muchísimas columnas.
          En el caso normal la tabla cabe, porque las celdas recortan en vez de estirarse. */}
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-tint)]">
            <tr>
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
            </tr>
          </thead>

          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="border-t border-border">
                {fields.map((field) => {
                  const value =
                    record.data?.[field.key] != null && record.data[field.key] !== ''
                      ? String(record.data[field.key])
                      : '—';

                  return (
                    <td key={field.key} className="px-4 py-2 align-middle text-text-primary">
                      {isEditingRow(record.id) ? (
                        renderEditor(field, record)
                      ) : (
                        <span className={`block truncate ${CELL_MAX_WIDTH}`} title={value}>
                          {value}
                        </span>
                      )}
                    </td>
                  );
                })}

                {!readOnly && (
                  <td className="w-px whitespace-nowrap px-4 py-2 align-middle">
                    {isEditingRow(record.id) ? (
                      <div className="flex gap-1">
                        <button
                          onClick={save}
                          disabled={saving}
                          className="rounded-lg p-1.5 text-success-600 hover:bg-success-50 disabled:opacity-50"
                          aria-label={t('save')}
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={cancel}
                          className="rounded-lg p-1.5 text-text-tertiary hover:bg-[var(--surface-tint)]"
                          aria-label={t('cancel')}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <button
                          onClick={() => startEdit(record)}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-text-secondary hover:bg-[var(--surface-tint)]"
                        >
                          {t('edit')}
                        </button>
                        <button
                          onClick={() => onDelete(record.id)}
                          className="hover:bg-danger/10 rounded-lg p-1.5 text-text-tertiary hover:text-danger"
                          aria-label={t('delete')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}

            {creating && (
              <tr className="border-t border-border bg-[var(--surface-tint)]">
                {fields.map((field) => (
                  <td key={field.key} className="px-4 py-2">
                    {renderEditor(field)}
                  </td>
                ))}
                <td className="w-px whitespace-nowrap px-4 py-2 align-middle">
                  <div className="flex gap-1">
                    <button
                      onClick={save}
                      disabled={saving}
                      className="rounded-lg p-1.5 text-success-600 hover:bg-success-50 disabled:opacity-50"
                      aria-label={t('save')}
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={cancel}
                      className="rounded-lg p-1.5 text-text-tertiary hover:bg-[var(--surface-tint)]"
                      aria-label={t('cancel')}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {records.length === 0 && !creating && (
              <tr>
                <td
                  colSpan={fields.length + (readOnly ? 0 : 1)}
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
          className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-accent hover:text-text-primary"
        >
          <Plus size={16} />
          {t('addRow')}
        </button>
      )}
    </div>
  );
}
