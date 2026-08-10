'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { DATASET_FIELD_TYPES, DatasetField, DatasetFieldType, MAX_DATASET_FIELDS } from '@tesseract/types';

/**
 * Constructor de columnas.
 *
 * Deliberadamente pobre en controles: nombre, tipo y —solo si es `select`— opciones. No hay
 * casillas de "visible para la IA" porque todo lo que esté en el dataset lo ve el modelo; el
 * dataset no es la base de datos del cliente, es la vista que su agente consume.
 *
 * La `key` no se edita: es el nombre del parámetro que verá el modelo, y renombrarla rompería su
 * agente en silencio. Se deriva del nombre al crear la columna y ahí queda.
 */

interface SchemaBuilderProps {
  fields: DatasetField[];
  onChange: (fields: DatasetField[]) => void;
  /** Columnas que ya existen en el servidor: su tipo queda congelado. */
  lockedKeys?: Set<string>;
}

export function SchemaBuilder({ fields, onChange, lockedKeys }: SchemaBuilderProps) {
  const t = useTranslations('Datasets');
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const update = (index: number, patch: Partial<DatasetField>) => {
    onChange(fields.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  };

  const addField = () => {
    onChange([
      ...fields,
      { key: '', label: '', type: 'text', order: fields.length },
    ]);
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

  return (
    <div className="space-y-3">
      {fields.map((field, index) => {
        const locked = !!field.key && lockedKeys?.has(field.key);

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
            className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-elevated p-4 sm:flex-row sm:items-start"
          >
            <GripVertical
              size={18}
              className="mt-2 hidden shrink-0 cursor-grab text-text-tertiary sm:block"
            />

            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                {/* `min-w-0` no es decorativo: sin él el input no baja de su ancho intrínseco
                    (`size=20`) y la fila deja de caber en el modal en cuanto aparece la barra de
                    scroll vertical, que es de donde salía el scroll horizontal. */}
                <input
                  value={field.label}
                  onChange={(event) => update(index, { label: event.target.value })}
                  placeholder={t('columnNamePlaceholder')}
                  className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                />

                <select
                  value={field.type}
                  disabled={locked}
                  onChange={(event) =>
                    update(index, {
                      type: event.target.value as DatasetFieldType,
                      options: event.target.value === 'select' ? (field.options ?? []) : undefined,
                    })
                  }
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-accent disabled:opacity-60 sm:w-44 sm:shrink-0"
                  title={locked ? t('typeLockedHint') : undefined}
                >
                  {DATASET_FIELD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`type_${type}`)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Las opciones del select viajan dentro de la firma de la tool: son lo que impide
                  que el modelo pida un valor que no existe. */}
              {field.type === 'select' && (
                <div>
                  <textarea
                    value={(field.options ?? []).join('\n')}
                    onChange={(event) =>
                      update(index, {
                        options: event.target.value
                          .split('\n')
                          .map((option) => option.trim())
                          .filter(Boolean),
                      })
                    }
                    rows={3}
                    placeholder={t('optionsPlaceholder')}
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs text-text-primary outline-none focus:border-accent"
                  />
                  <p className="mt-1 text-xs text-text-tertiary">{t('optionsHint')}</p>
                </div>
              )}

              <p className="text-xs text-text-tertiary">{t(`typeHint_${field.type}`)}</p>
            </div>

            <button
              type="button"
              onClick={() => removeField(index)}
              className="hover:bg-danger/10 shrink-0 self-start rounded-xl p-2 text-text-tertiary transition-colors hover:text-danger"
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
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-sm font-medium text-text-secondary transition-colors hover:border-accent hover:text-text-primary"
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
