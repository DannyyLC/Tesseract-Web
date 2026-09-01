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
 * Constructor de columnas.
 *
 * Deliberadamente pobre en controles: nombre, tipo y —solo si es `select`— opciones o —solo si es
 * `number`— fórmula. No hay casillas de "visible para la IA" porque todo lo que esté en el dataset
 * lo ve el modelo; el dataset no es la base de datos del cliente, es la vista que su agente consume.
 *
 * La `key` no se edita: es el nombre del parámetro que verá el modelo, y renombrarla rompería su
 * agente en silencio. Se deriva del nombre al crear la columna y ahí queda.
 *
 * Las fórmulas se guardan referenciando esas `key`, pero el cliente nunca las teclea: los chips de
 * abajo muestran el nombre visible de cada columna e insertan su key. Es lo que permite que el
 * label se siga editando libremente sin romper ninguna fórmula.
 */

interface SchemaBuilderProps {
  fields: DatasetField[];
  onChange: (fields: DatasetField[]) => void;
  /**
   * Columnas tal como están guardadas en el servidor. Su tipo queda congelado, y sirven para avisar
   * cuando esta edición quita una columna de la que depende una fórmula. Vacío al crear el dataset.
   */
  savedFields?: DatasetField[];
}

/**
 * Detecta si una fórmula usa una `key` concreta.
 *
 * Es una comprobación de UI para avisar antes de guardar, no el mecanismo que decide nada: el
 * servidor es quien evalúa de verdad. Por eso basta un match de palabra completa, y un falso
 * negativo solo significa que el aviso no sale — el resultado sigue siendo el acordado: la columna
 * calculada queda vacía.
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
 * **Por qué tiene estado propio en vez de leer `options` directo.** El textarea es controlado y las
 * opciones se guardan ya normalizadas, así que pintar `options.join('\n')` como valor obliga a que
 * el texto sobreviva un viaje de ida y vuelta por `parseOptions` en cada tecla. Ese viaje se come
 * justo lo que se acaba de teclear mientras todavía no es una opción: al pulsar Enter el valor
 * crudo es `"Nivel III\n"`, el renglón vacío del final se descarta y el textarea se repinta sin el
 * salto de línea. El efecto era que **por teclado no se podía crear un renglón**; solo funcionaba
 * pegar un bloque de varias líneas, porque ahí ningún segmento queda vacío. Con un espacio
 * intermedio pasaba lo mismo: `trim()` lo borraba antes de poder escribir la siguiente palabra.
 *
 * Así que mientras se escribe manda el borrador —que sí conserva renglones vacíos y espacios— y
 * hacia fuera siempre viajan las opciones normalizadas. Al salir del campo el borrador se limpia,
 * para que lo que se ve sea lo que se va a guardar.
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
      className="w-full rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs text-text-primary outline-none focus:border-accent"
    />
  );
}

export function SchemaBuilder({ fields, onChange, savedFields = [] }: SchemaBuilderProps) {
  const t = useTranslations('Datasets');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const lockedKeys = new Set(savedFields.map((field) => field.key));

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

  /**
   * Columnas numéricas que una fórmula puede usar: las demás, con nombre.
   *
   * Una columna recién creada en este mismo borrador todavía no tiene `key` —el Gateway se la
   * asigna al guardar—, así que se deriva aquí con el mismo `slugifyKey` que usa el servidor. Tiene
   * que ser idéntico en los dos lados: si el botón insertara una key distinta de la que el Gateway
   * termina asignando, la fórmula quedaría apuntando a una columna que no existe, en silencio.
   */
  const numericPeers = (index: number) =>
    fields
      .filter((peer, i) => i !== index && peer.type === 'number' && !!peer.label.trim())
      .map((peer) => ({ ...peer, key: peer.key || slugifyKey(peer.label) }));

  /**
   * Columnas guardadas que la fórmula usa y que este borrador ya no incluye: se están quitando en
   * esta misma edición.
   *
   * Quitarlas está permitido a propósito, y la columna calculada queda vacía. Lo que no debe pasar
   * es que el cliente se entere después, cuando su agente empiece a cotizar sin precio final.
   */
  const missingDependencies = (field: DatasetField): string[] => {
    if (!field.formula) return [];

    const formula = field.formula;

    return savedFields
      .filter((saved) => !fields.some((draft) => draft.key === saved.key))
      .filter((saved) => formulaUsesKey(formula, saved.key))
      .map((saved) => saved.label || saved.key);
  };

  /**
   * Palabras de la fórmula que no coinciden con ninguna key válida ahora mismo: ni una
   * columna numérica del borrador (`peers`, guardada o no), ni una ya guardada (esas las
   * cubre `missingDependencies`, con su propio aviso).
   *
   * Es el caso que `missingDependencies` no ve: referenciar una columna todavía sin
   * guardar y después renombrarla en la misma edición. La key predicha cambia
   * (`slugifyKey` del label nuevo) y la referencia vieja queda apuntando a nada — sin
   * este aviso, eso se descubre después de guardar, en silencio, con la columna
   * calculada evaluando a null.
   *
   * Igual que `formulaUsesKey`, es una comprobación de UI para avisar antes de
   * guardar, no el mecanismo que decide nada: un falso negativo solo significa que el
   * aviso no sale.
   */
  const staleFormulaKeys = (
    field: DatasetField,
    peers: { key: string; label: string }[],
  ): string[] => {
    if (!field.formula) return [];

    const validKeys = new Set([
      ...peers.map((peer) => peer.key),
      ...savedFields.map((saved) => saved.key),
    ]);

    const tokens = field.formula.match(/[a-z][a-z0-9_]*/g) ?? [];

    return [
      ...new Set(
        tokens.filter((token) => token !== ROUND_FUNCTION && !validKeys.has(token)),
      ),
    ];
  };

  return (
    <div className="space-y-3">
      {fields.map((field, index) => {
        const locked = !!field.key && lockedKeys.has(field.key);
        // Una sola pasada: antes numericPeers(index) se recalculaba (filter +
        // slugifyKey por cada peer) dos veces por render de cada campo numérico
        // abierto, una para el guard y otra para el .map() de los chips.
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
                      // La fórmula se va con el tipo, igual que las opciones: solo un número se calcula.
                      formula: event.target.value === 'number' ? field.formula : undefined,
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
                  <OptionsEditor
                    options={field.options ?? []}
                    onChange={(options) => update(index, { options })}
                    placeholder={t('optionsPlaceholder')}
                  />
                  <p className="mt-1 text-xs text-text-tertiary">{t('optionsHint')}</p>
                </div>
              )}

              {/* Una columna numérica se puede calcular a partir de otras. El valor se resuelve al
                  guardar la fila y se guarda como un número más, así que el agente lo recibe ya
                  hecho en vez de tener que multiplicar él —que es donde se equivoca—. */}
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
                    <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
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
                        className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 font-mono text-xs text-text-primary outline-none focus:border-accent"
                      />

                      {/* El chip enseña el nombre visible e inserta la key: así el cliente nunca
                          tiene que conocer las keys internas, que es lo que la UI le esconde. */}
                      {peers.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-text-tertiary">{t('formulaColumnsHint')}</span>
                          {peers.map((peer) => (
                            <button
                              key={peer.key}
                              type="button"
                              onClick={() =>
                                update(index, { formula: `${field.formula ?? ''}${peer.key}` })
                              }
                              className="rounded-md border border-border px-2 py-0.5 font-mono text-xs text-text-secondary transition-colors hover:border-accent hover:text-text-primary"
                            >
                              {peer.label || peer.key}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* `round` (ROUND_FUNCTION) es el único nombre de función que existe —en
                          inglés, como todos los nombres de función de fórmula (ver formula.ts)—; el
                          botón solo agrega la llamada vacía al final, el cliente escribe adentro lo
                          que quiere redondear y a cuántos decimales. */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-text-tertiary">{t('formulaFunctionsHint')}</span>
                        <button
                          type="button"
                          onClick={() =>
                            update(index, { formula: `${field.formula ?? ''}${ROUND_FUNCTION}()` })
                          }
                          title={t('formulaRoundTitle')}
                          className="rounded-md border border-border px-2 py-0.5 font-mono text-xs text-text-secondary transition-colors hover:border-accent hover:text-text-primary"
                        >
                          {t('formulaRoundButton')}
                        </button>
                      </div>

                      <p className="text-xs text-text-tertiary">{t('formulaHint')}</p>

                      {missingDependencies(field).map((missing) => (
                        <p
                          key={missing}
                          className="flex items-start gap-1.5 text-xs text-warning-600"
                        >
                          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                          {t('formulaMissingDependency', { column: missing })}
                        </p>
                      ))}

                      {stale.map((label) => (
                        <p
                          key={label}
                          className="flex items-start gap-1.5 text-xs text-warning-600"
                        >
                          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                          {t('formulaStaleKey', { column: label })}
                        </p>
                      ))}
                    </div>
                  )}
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
