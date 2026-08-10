/**
 * Datasets — las mini bases de datos que un cliente captura para que su agente las consulte.
 *
 * El cliente define las columnas desde la UI, así que el schema es **dato, no código**: a partir
 * de `DatasetField[]` el Gateway genera la firma tipada de la tool que el LLM invoca.
 *
 * **El tipo de columna define qué puede hacer el modelo con ella.** Es la regla que sostiene todo
 * el diseño y por eso el set de tipos es corto y cerrado.
 */

/**
 * Tipos de columna soportados.
 *
 * No hay booleano (es un `select` de dos opciones) ni texto largo (es `text` con otro widget).
 * `date` es **sin hora** a propósito: un catálogo nunca la necesita, y así se esquiva por completo
 * el problema de zonas horarias del resto del sistema.
 */
export const DATASET_FIELD_TYPES = ['text', 'number', 'select', 'date'] as const;

export type DatasetFieldType = (typeof DATASET_FIELD_TYPES)[number];

/**
 * Definición de una columna.
 *
 * `key` es lo que viaja al LLM como nombre de parámetro de la tool, de ahí que sea `snake_case` e
 * inmutable: renombrarla rompería en silencio el agente del cliente. El `label` sí se edita libre.
 */
export interface DatasetField {
  /** Identificador estable y `snake_case`. Inmutable una vez creado. */
  key: string;
  /** Nombre que ve el cliente en la UI. Editable. */
  label: string;
  type: DatasetFieldType;
  /** Solo para `select`: las opciones válidas. Viajan dentro de la firma de la tool. */
  options?: string[];
  /** Orden de despliegue en la UI. */
  order: number;
  /**
   * Borrado lógico. Un field con `deletedAt` desaparece de la UI y de la firma de la tool, pero
   * sus valores siguen en `DatasetRecord.data`, así que restaurarlo no pierde nada.
   */
  deletedAt?: string | null;
}

export interface DatasetSummaryDto {
  id: string;
  name: string;
  description: string | null;
  /** Columnas vivas (sin las borradas lógicamente). */
  fieldCount: number;
  recordCount: number;
  /** Workflows que hoy consultan este dataset. */
  workflowIds: string[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** Referencia mínima a un workflow conectado. */
export interface DatasetWorkflowRef {
  id: string;
  name: string;
}

export interface DatasetDto extends Omit<DatasetSummaryDto, 'fieldCount' | 'workflowIds'> {
  fields: DatasetField[];
  /**
   * Workflows conectados, con nombre. El detalle los **lista**, no solo los cuenta, así que no le
   * basta con los ids: sin el nombre tendría que traerse el catálogo completo de workflows para
   * resolverlos, que es justo lo que hacía la versión anterior de la pantalla.
   */
  workflows: DatasetWorkflowRef[];
}

export interface DatasetRecordDto {
  id: string;
  data: Record<string, string | number | null>;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Uso contra los límites del plan. La UI lo necesita para explicar por qué está bloqueado el alta
 * en vez de solo deshabilitar el botón.
 */
export interface DatasetUsageDto {
  datasets: number;
  maxDatasets: number;
  rows: number;
  maxDatasetRows: number;
  /**
   * `true` cuando la organización está por encima de su límite de filas — típicamente tras bajar
   * de plan. No se borra nada ni se deja de leer: solo se bloquean las altas.
   */
  writesBlocked: boolean;
}

// ============================================
// Consulta (la usan la UI y la tool del agente)
// ============================================

/** Filtro por rango, para columnas `number` y `date`. */
export interface DatasetRangeFilter {
  min?: number | string;
  max?: number | string;
}

export interface DatasetSearchRequest {
  /** `{ marca: ['Toyota', 'Ford'] }` — OR dentro del campo, AND entre campos. */
  select?: Record<string, string[]>;
  /** `{ precio: { min: 200000, max: 300000 } }`. */
  range?: Record<string, DatasetRangeFilter>;
  /**
   * Texto libre. Barre **todas** las columnas de texto a la vez, en vez de exponer un parámetro
   * por columna: el modelo no sabe si la frase está en el nombre o en la descripción, y obligarlo
   * a elegir lo hace fallar en silencio.
   */
  query?: string;
  /** `precio` asciende, `-precio` desciende. */
  sortBy?: string;
  limit?: number;
  offset?: number;
}

export interface DatasetSearchResponse {
  /** Coincidencias totales, no las devueltas. Evita traer 200 filas para contestar "¿cuántos hay?". */
  total: number;
  items: DatasetRecordDto[];
}

/** Valores distintos de una columna, con su conteo. Contesta "¿qué marcas manejan?". */
export interface DatasetFieldValuesResponse {
  field: string;
  values: { value: string; count: number }[];
}

// ============================================
// Importación CSV
// ============================================

export interface DatasetImportRowError {
  /** Número de fila del archivo, 1-indexado y contando el encabezado. */
  row: number;
  message: string;
}

export interface DatasetImportResultDto {
  imported: number;
  failed: number;
  errors: DatasetImportRowError[];
}
