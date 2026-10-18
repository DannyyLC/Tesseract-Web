/**
 * Capacidades de cada modelo del catálogo (`llm_models`): si acepta `temperature` y qué
 * `model_params` admite. Las consumen el validador de workflows (rechaza al guardar) y el
 * contexto del editor (muestra solo lo que cada modelo permite configurar).
 */

export interface ModelCapabilities {
  supportsTemperature: boolean;
  allowedParams: Record<string, string[]>;
}

/** Lo mínimo que se lee de una fila de `llm_models` para resolver su vigencia y capacidades. */
interface CatalogRow {
  modelName: string;
  effectiveTo?: Date | null;
  supportsTemperature?: boolean;
  allowedParams?: unknown;
}

/**
 * Una fila por `modelName`: la vigente más reciente y, si ninguna lo está, la más reciente.
 * La tabla versiona precios (varias filas por modelo), así que las filas deben llegar
 * ordenadas por `effectiveFrom` desc. Conserva el orden en que aparece cada modelo.
 */
export function currentRowPerModel<T extends CatalogRow>(rows: T[]): T[] {
  const now = new Date();
  const chosen = new Map<string, { current: boolean; row: T }>();

  for (const row of rows) {
    const current = !row.effectiveTo || row.effectiveTo >= now;
    const previous = chosen.get(row.modelName);
    if (previous && (previous.current || !current)) continue;
    chosen.set(row.modelName, { current, row });
  }

  return Array.from(chosen.values(), ({ row }) => row);
}

/** Capacidades de una fila del catálogo; lo que falte se toma con los defaults de la columna. */
export function toCapabilities(row: CatalogRow): ModelCapabilities {
  return {
    supportsTemperature: row.supportsTemperature !== false,
    allowedParams: toAllowedParams(row.allowedParams),
  };
}

/** Capacidades por nombre de modelo, tomadas de su fila vigente (ver `currentRowPerModel`). */
export function capabilitiesByModel(rows: CatalogRow[]): Map<string, ModelCapabilities> {
  return new Map(currentRowPerModel(rows).map((row) => [row.modelName, toCapabilities(row)]));
}

/** `allowedParams` viene de una columna JSON: lo que no tenga la forma esperada se ignora. */
export function toAllowedParams(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, string[]> = {};
  for (const [param, values] of Object.entries(raw)) {
    if (Array.isArray(values)) {
      result[param] = values.filter((v): v is string => typeof v === 'string');
    }
  }
  return result;
}
