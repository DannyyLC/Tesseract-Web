import { createHash } from 'crypto';

/**
 * Serialización canónica: mismas claves ⇒ misma cadena, sin importar el orden en que
 * lleguen. Necesario porque el cliente puede mandar las claves en cualquier orden y
 * un reordenamiento no debe contar como cambio.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as any)[key])}`);
  return `{${entries.join(',')}}`;
}

/** sha256 del JSON canónico. Se usa para no escribir un snapshot si nada cambió. */
export function hashConfig(config: unknown): string {
  return createHash('sha256').update(stableStringify(config)).digest('hex');
}

/** Tamaño en bytes del config serializado, para mostrarlo en el historial. */
export function configSizeBytes(config: unknown): number {
  return Buffer.byteLength(JSON.stringify(config) ?? '', 'utf8');
}

export type DiffOp = 'added' | 'removed' | 'changed';

export interface ConfigDiffEntry {
  /** Ruta plana, p.ej. `agents.general.system_prompt` o `graph.nodes[3].config.mode`. */
  path: string;
  op: DiffOp;
  before?: unknown;
  after?: unknown;
  /** true si algún valor se recortó por longitud. */
  truncated?: boolean;
}

/** Los prompts pueden medir decenas de KB; sin recorte, un diff devolvería el documento entero. */
const MAX_VALUE_CHARS = 2000;
/** Contexto que se conserva a cada lado del punto donde los textos empiezan a diferir. */
const CONTEXT_CHARS = 400;

/** Primer índice en el que dos textos dejan de coincidir. */
function firstDifference(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

/**
 * Recorta un par de textos alrededor de su punto de divergencia.
 *
 * Recortar desde el inicio hacía el diff inútil justo en el caso para el que existe:
 * un prompt de 4 000 caracteres al que se le ajusta el cierre produce dos recortes
 * idénticos, porque lo que cambió queda fuera de la ventana. Centrando la ventana en
 * la primera diferencia, el cambio siempre se ve.
 */
function truncateAround(before: string, after: string) {
  if (before.length <= MAX_VALUE_CHARS && after.length <= MAX_VALUE_CHARS) {
    return { before, after, truncated: false };
  }

  const start = Math.max(0, firstDifference(before, after) - CONTEXT_CHARS);
  const cut = (text: string) => {
    const end = Math.min(text.length, start + MAX_VALUE_CHARS);
    return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
  };

  return { before: cut(before), after: cut(after), truncated: true };
}

function truncateValue(value: unknown): { value: unknown; truncated: boolean } {
  if (typeof value === 'string' && value.length > MAX_VALUE_CHARS) {
    return { value: `${value.slice(0, MAX_VALUE_CHARS)}…`, truncated: true };
  }
  if (value !== null && typeof value === 'object') {
    const serialized = JSON.stringify(value) ?? '';
    if (serialized.length > MAX_VALUE_CHARS) {
      return { value: `${serialized.slice(0, MAX_VALUE_CHARS)}…`, truncated: true };
    }
  }
  return { value, truncated: false };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function joinPath(base: string, key: string | number): string {
  if (typeof key === 'number') return `${base}[${key}]`;
  return base ? `${base}.${key}` : key;
}

/**
 * Diff por rutas entre dos configs. Se calcula al vuelo para mostrarlo (igual que
 * `git diff`); nunca se almacena. Los snapshots guardan el documento completo.
 *
 * Recorre en paralelo ambos árboles y solo desciende cuando ambos lados son del
 * mismo tipo compuesto; en cuanto difieren, reporta la ruta y corta. Así un prompt
 * cambiado produce una entrada, no una por cada carácter.
 */
export function diffConfigs(before: unknown, after: unknown): ConfigDiffEntry[] {
  const entries: ConfigDiffEntry[] = [];

  const walk = (a: unknown, b: unknown, path: string): void => {
    if (stableStringify(a) === stableStringify(b)) return;

    const aIsObj = isPlainObject(a);
    const bIsObj = isPlainObject(b);
    const aIsArr = Array.isArray(a);
    const bIsArr = Array.isArray(b);

    if (aIsObj && bIsObj) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (!(key in a)) {
          pushEntry(entries, joinPath(path, key), 'added', undefined, b[key]);
          continue;
        }
        if (!(key in b)) {
          pushEntry(entries, joinPath(path, key), 'removed', a[key], undefined);
          continue;
        }
        walk(a[key], b[key], joinPath(path, key));
      }
      return;
    }

    if (aIsArr && bIsArr) {
      const max = Math.max(a.length, b.length);
      for (let i = 0; i < max; i++) {
        if (i >= a.length) {
          pushEntry(entries, joinPath(path, i), 'added', undefined, b[i]);
          continue;
        }
        if (i >= b.length) {
          pushEntry(entries, joinPath(path, i), 'removed', a[i], undefined);
          continue;
        }
        walk(a[i], b[i], joinPath(path, i));
      }
      return;
    }

    if (a === undefined) return pushEntry(entries, path, 'added', undefined, b);
    if (b === undefined) return pushEntry(entries, path, 'removed', a, undefined);
    pushEntry(entries, path, 'changed', a, b);
  };

  walk(before, after, '');
  return entries;
}

function pushEntry(
  entries: ConfigDiffEntry[],
  path: string,
  op: DiffOp,
  before: unknown,
  after: unknown,
): void {
  // Cuando ambos lados son texto (el caso de un system_prompt editado) se recorta
  // alrededor de la diferencia; si no, cada valor se recorta por su cuenta.
  if (op === 'changed' && typeof before === 'string' && typeof after === 'string') {
    const windowed = truncateAround(before, after);
    entries.push({
      path,
      op,
      before: windowed.before,
      after: windowed.after,
      ...(windowed.truncated && { truncated: true }),
    });
    return;
  }

  const b = truncateValue(before);
  const a = truncateValue(after);
  entries.push({
    path,
    op,
    ...(op !== 'added' && { before: b.value }),
    ...(op !== 'removed' && { after: a.value }),
    ...((b.truncated || a.truncated) && { truncated: true }),
  });
}
