'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, GripVertical, Plus, Sigma, Trash2 } from 'lucide-react';
import {
  DATASET_FIELD_TYPES,
  DatasetField,
  DatasetFieldType,
  MAX_DATASET_FIELDS,
  ROUND_FUNCTION,
  slugifyKey,
} from '@tesseract/types';

/**
 * Clon admin de `(dashboard)/datasets/_components/schema-builder.tsx`. Misma lógica; se clona en
 * vez de compartirse a propósito, para no acoplar la superficie admin con la del cliente.
 *
 * La `key` no se edita una vez guardada: es el nombre del parámetro que ve el modelo, y
 * renombrarla rompería el agente del cliente en silencio.
 */

const formulaUsesKey = (formula: string, key: string): boolean =>
  new RegExp(`(^|[^a-z0-9_])${key}($|[^a-z0-9_])`).test(formula);

/** Texto del textarea -> lista de opciones. Un renglón por opción, sin vacíos ni espacios de sobra. */
const parseOptions = (text: string): string[] =>
  text
    .split('\n')
    .map((option) => option.trim())
    .filter(Boolean);

/**
 * Editor de las opciones de una columna `select`.
 *
 * Tiene estado propio porque el textarea es controlado y las opciones se guardan ya normalizadas:
 * pintar `options.join('\n')` como valor obliga a que el texto sobreviva un viaje de ida y vuelta
 * por `parseOptions` en cada tecla, y ese viaje se come justo lo que se acaba de teclear mientras
 * todavía no es una opción. Al pulsar Enter el valor crudo es `"Nivel III\n"`, el renglón vacío del
 * final se descarta y el textarea se repinta sin el salto de línea: **por teclado no se podía crear
 * un renglón**, solo pegando un bloque de varias líneas.
 *
 * Mientras se escribe manda el borrador; hacia fuera siempre viajan las opciones normalizadas.
 */
function OptionsEditor({
  options,
  onChange,
  placeholder,
}: {
  options: string[];
  onChange: (options: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState(() => options.join('\n'));
  const committed = options.join('\n');

  // Resincroniza solo cuando lo de fuera dejó de corresponder a lo tecleado: otra columna, o un
  // dataset recién cargado. Si equivale al borrador, pisarlo borraría el renglón en curso.
  useEffect(() => {
    if (parseOptions(draft).join('\n') !== committed) {
      setDraft(committed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committed]);

  return (
    <textarea
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange(parseOptions(event.target.value));
      }}
      onBlur={() => setDraft(parseOptions(draft).join('\n'))}
      rows={3}
      placeholder={placeholder}
      className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-text-primary outline-none focus:border-border-focus"
    />
  );
}

interface SchemaBuilderProps {
  fields: DatasetField[];
  onChange: (fields: DatasetField[]) => void;
  savedFields?: DatasetField[];
}

export function SchemaBuilder({ fields, onChange, savedFields = [] }: SchemaBuilderProps) {
  const t = useTranslations('Datasets');
  const TYPE_LABEL: Record<DatasetFieldType, string> = {
    text: t('type_text'),
    number: t('type_number'),
    select: t('type_select'),
    date: t('type_date'),
  };
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const lockedKeys = new Set(savedFields.map((field) => field.key));

  const update = (index: number, patch: Partial<DatasetField>) => {
    onChange(fields.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  };

  const addField = () => {
    onChange([...fields, { key: '', label: '', type: 'text', order: fields.length }]);
  };

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index).map((field, i) => ({ ...field, order: i })));
  };

  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...fields];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next.map((field, i) => ({ ...field, order: i })));
  };

  const numericPeers = (index: number) =>
    fields
      .filter((peer, i) => i !== index && peer.type === 'number' && !!peer.label.trim())
      .map((peer) => ({ ...peer, key: peer.key || slugifyKey(peer.label) }));

  const missingDependencies = (field: DatasetField): string[] => {
    if (!field.formula) return [];
    const formula = field.formula;
    return savedFields
      .filter((saved) => !fields.some((draft) => draft.key === saved.key))
      .filter((saved) => formulaUsesKey(formula, saved.key))
      .map((saved) => saved.label || saved.key);
  };

  const staleFormulaKeys = (field: DatasetField, peers: { key: string; label: string }[]): string[] => {
    if (!field.formula) return [];
    const validKeys = new Set([...peers.map((peer) => peer.key), ...savedFields.map((saved) => saved.key)]);
    const tokens = field.formula.match(/[a-z][a-z0-9_]*/g) ?? [];
    return [...new Set(tokens.filter((token) => token !== ROUND_FUNCTION && !validKeys.has(token)))];
  };

  return (
    <div className="space-y-3">
      {fields.map((field, index) => {
        const locked = !!field.key && lockedKeys.has(field.key);
        const peers = field.type === 'number' ? numericPeers(index) : [];
        const stale = field.type === 'number' ? staleFormulaKeys(field, peers) : [];

        return (
          <div
            key={field.key || `new-${index}`}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null) move(dragIndex, index);
              setDragIndex(null);
            }}
            className="flex flex-col gap-3 rounded-xl border border-border bg-surface-elevated p-4 sm:flex-row sm:items-start"
          >
            <GripVertical size={18} className="mt-2 hidden shrink-0 cursor-grab text-text-tertiary sm:block" />

            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={field.label}
                  onChange={(event) => update(index, { label: event.target.value })}
                  placeholder={t('columnNamePlaceholder')}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border-focus"
                />

                <select
                  value={field.type}
                  disabled={locked}
                  onChange={(event) =>
                    update(index, {
                      type: event.target.value as DatasetFieldType,
                      options: event.target.value === 'select' ? (field.options ?? []) : undefined,
                      formula: event.target.value === 'number' ? field.formula : undefined,
                    })
                  }
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border-focus disabled:opacity-60 sm:w-44 sm:shrink-0"
                  title={locked ? t('typeLockedHint') : undefined}
                >
                  {DATASET_FIELD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {TYPE_LABEL[type]}
                    </option>
                  ))}
                </select>
              </div>

              {field.type === 'select' && (
                <div>
                  <OptionsEditor
                    options={field.options ?? []}
                    onChange={(options) => update(index, { options })}
                    placeholder={t('optionsPlaceholder')}
                  />
                  <p className="mt-1 text-xs text-text-tertiary">{t('optionsHint')}</p>
                </div>
              )}

              {field.type === 'number' && (
                <div>
                  {field.formula === undefined ? (
                    <button
                      type="button"
                      onClick={() => update(index, { formula: '' })}
                      className="flex items-center gap-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-accent"
                    >
                      <Sigma size={13} />
                      {t('formulaEnable')}
                    </button>
                  ) : (
                    <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                          <Sigma size={13} />
                          {t('formulaLabel')}
                        </span>
                        <button
                          type="button"
                          onClick={() => update(index, { formula: undefined })}
                          className="text-xs text-text-tertiary transition-colors hover:text-danger"
                        >
                          {t('formulaRemove')}
                        </button>
                      </div>

                      <input
                        value={field.formula}
                        onChange={(event) => update(index, { formula: event.target.value })}
                        placeholder={t('formulaPlaceholder')}
                        className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 font-mono text-xs text-text-primary outline-none focus:border-border-focus"
                      />

                      {peers.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-text-tertiary">{t('formulaColumnsHint')}</span>
                          {peers.map((peer) => (
                            <button
                              key={peer.key}
                              type="button"
                              onClick={() => update(index, { formula: `${field.formula ?? ''}${peer.key}` })}
                              className="rounded-md border border-border px-2 py-0.5 font-mono text-xs text-text-secondary transition-colors hover:border-border-focus hover:text-text-primary"
                            >
                              {peer.label || peer.key}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-text-tertiary">{t('formulaFunctionsHint')}</span>
                        <button
                          type="button"
                          onClick={() => update(index, { formula: `${field.formula ?? ''}${ROUND_FUNCTION}()` })}
                          title={t('formulaRoundTitle')}
                          className="rounded-md border border-border px-2 py-0.5 font-mono text-xs text-text-secondary transition-colors hover:border-border-focus hover:text-text-primary"
                        >
                          {t('formulaRoundButton')}
                        </button>
                      </div>

                      {missingDependencies(field).map((missing) => (
                        <p key={missing} className="flex items-start gap-1.5 text-xs text-warning-600">
                          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                          {t('formulaMissingDependency', { column: missing })}
                        </p>
                      ))}

                      {stale.map((label) => (
                        <p key={label} className="flex items-start gap-1.5 text-xs text-warning-600">
                          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                          {t('formulaStaleKey', { column: label })}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => removeField(index)}
              className="hover:bg-danger/10 shrink-0 self-start rounded-lg p-2 text-text-tertiary transition-colors hover:text-danger"
              aria-label={t('removeColumn')}
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}

      {fields.length < MAX_DATASET_FIELDS ? (
        <button
          type="button"
          onClick={addField}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm font-medium text-text-secondary transition-colors hover:border-border-focus hover:text-text-primary"
        >
          <Plus size={16} />
          {t('addColumn')}
        </button>
      ) : (
        <p className="text-xs text-text-tertiary">{t('maxColumnsReached', { max: MAX_DATASET_FIELDS })}</p>
      )}
    </div>
  );
}
