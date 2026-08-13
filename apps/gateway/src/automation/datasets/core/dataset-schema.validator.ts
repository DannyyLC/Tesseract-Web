import { BadRequestException } from '@nestjs/common';
import {
  DATASET_FIELD_TYPES,
  DatasetField,
  DatasetFieldType,
  MAX_DATASET_FIELDS,
} from '@tesseract/types';
import { FormulaNode, ROUND_FUNCTION, evaluateFormula, formulaDependencies, parseFormula } from './formula';

/**
 * Reglas del schema de un dataset y validación de las filas contra él.
 *
 * Dos responsabilidades que conviene tener juntas porque comparten las mismas invariantes:
 *
 * 1. **Evolución del schema, solo aditiva.** La `key` de una columna se convierte literalmente en
 *    el nombre de un parámetro de la tool que ve el LLM, así que renombrarla o cambiarle el tipo
 *    rompería el agente del cliente en silencio, sin ningún error visible. Por eso: `key`
 *    inmutable, borrado lógico y tipo congelado.
 *
 * 2. **Forma de los valores.** Los números se guardan como números JSON y las fechas como
 *    `YYYY-MM-DD`, para que el filtro por rango pueda castear `(data->'precio')::numeric` sin
 *    reventar contra un string que se coló.
 */

/**
 * Nombres que no puede tomar una columna porque el generador de la firma de la tool ya los usa
 * para sus propios parámetros. Si un cliente llamara `limit` a una columna, su filtro chocaría con
 * el de paginación y el modelo recibiría una firma ambigua.
 */
const RESERVED_KEYS = new Set([
  'id',
  'query',
  'limit',
  'offset',
  'sort_by',
  'total',
  'items',
  'field',
  // Es el nombre de función del evaluador de fórmulas: una columna así se volvería inalcanzable
  // desde cualquier fórmula, porque el parser leería la palabra como una llamada.
  ROUND_FUNCTION,
]);

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const KEY_MAX_LENGTH = 40;
const LABEL_MAX_LENGTH = 80;
const SELECT_MAX_OPTIONS = 200;
const TEXT_MAX_LENGTH = 4000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Columnas vivas, en orden. Las borradas lógicamente no existen para nadie salvo el restaurador. */
export function liveFields(fields: DatasetField[]): DatasetField[] {
  return fields.filter((field) => !field.deletedAt).sort((a, b) => a.order - b.order);
}

export function fieldsOfType(fields: DatasetField[], type: DatasetFieldType): DatasetField[] {
  return liveFields(fields).filter((field) => field.type === type);
}

/**
 * Deriva una `key` válida a partir del label que escribió el cliente.
 *
 * `"Nivel de blindaje (NIJ)"` → `nivel_de_blindaje_nij`. La UI la propone y el cliente puede
 * corregirla, pero solo al crear la columna: después queda congelada.
 */
export function slugifyKey(label: string): string {
  const normalized = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos: "años" → "anos"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, KEY_MAX_LENGTH);

  // Una key debe empezar por letra: "2024_modelo" no es un identificador válido.
  return /^[a-z]/.test(normalized) ? normalized : `campo_${normalized}`.slice(0, KEY_MAX_LENGTH);
}

/**
 * Valida una definición completa de columnas.
 *
 * Esto NO es una medida de seguridad: quien edita el dataset ya está autorizado por su propia
 * organización, y si escribe descripciones raras solo se sabotea a sí mismo. Es una restricción
 * funcional — la `key` tiene que ser un identificador válido para el schema de la tool.
 */
export function validateFields(fields: DatasetField[]): void {
  const live = fields.filter((field) => !field.deletedAt);

  if (live.length === 0) {
    throw new BadRequestException('El dataset necesita al menos una columna');
  }

  if (live.length > MAX_DATASET_FIELDS) {
    throw new BadRequestException(
      `Un dataset admite hasta ${MAX_DATASET_FIELDS} columnas y este tiene ${live.length}. ` +
        'Pasado ese punto el agente empieza a elegir mal los filtros; ' +
        'si necesitas más, casi siempre son dos datasets distintos.',
    );
  }

  const seen = new Set<string>();

  for (const field of fields) {
    if (!KEY_PATTERN.test(field.key) || field.key.length > KEY_MAX_LENGTH) {
      throw new BadRequestException(
        `La clave "${field.key}" no es válida: debe empezar con letra minúscula y usar solo ` +
          `letras, números y guiones bajos (máximo ${KEY_MAX_LENGTH} caracteres)`,
      );
    }

    if (RESERVED_KEYS.has(field.key)) {
      throw new BadRequestException(
        `La clave "${field.key}" está reservada por el buscador; elige otra`,
      );
    }

    if (seen.has(field.key)) {
      throw new BadRequestException(`La clave "${field.key}" está repetida`);
    }
    seen.add(field.key);

    if (!field.label?.trim()) {
      throw new BadRequestException(`La columna "${field.key}" necesita un nombre`);
    }

    if (field.label.length > LABEL_MAX_LENGTH) {
      throw new BadRequestException(
        `El nombre de "${field.key}" excede ${LABEL_MAX_LENGTH} caracteres`,
      );
    }

    if (!DATASET_FIELD_TYPES.includes(field.type)) {
      throw new BadRequestException(
        `Tipo "${field.type}" no soportado. Disponibles: ${DATASET_FIELD_TYPES.join(', ')}`,
      );
    }

    if (field.type === 'select') {
      const options = field.options ?? [];

      if (options.length === 0) {
        throw new BadRequestException(`La columna "${field.label}" necesita al menos una opción`);
      }

      if (options.length > SELECT_MAX_OPTIONS) {
        throw new BadRequestException(
          `La columna "${field.label}" excede ${SELECT_MAX_OPTIONS} opciones`,
        );
      }

      if (new Set(options).size !== options.length) {
        throw new BadRequestException(`La columna "${field.label}" tiene opciones repetidas`);
      }
    }

    if (field.formula && field.type !== 'number') {
      throw new BadRequestException(
        `La columna "${field.label}" no puede tener fórmula porque no es numérica. ` +
          'Solo una columna de tipo número se puede calcular.',
      );
    }
  }

  // Compila las fórmulas y ordena las dependencias: es donde se detectan la sintaxis inválida, las
  // referencias a columnas no numéricas y los ciclos. Se descarta el resultado porque aquí solo
  // interesa que no lance.
  buildComputePlan(fields);
}

/**
 * Una columna calculada ya compilada, junto con el orden en el que hay que evaluarla.
 *
 * El orden es topológico: cuando le toca a una columna, las columnas de las que depende ya tienen
 * valor. Sin esto, una fórmula que use otra calculada leería `null` la mitad de las veces según el
 * orden en que el cliente haya acomodado las columnas en la UI.
 */
export interface ComputedColumn {
  key: string;
  node: FormulaNode;
}

export type ComputePlan = ComputedColumn[];

/**
 * Compila las fórmulas del schema una sola vez y las devuelve en orden de evaluación.
 *
 * Se construye aparte de `validateRecord` porque una importación de CSV valida hasta 5 000 filas
 * contra el mismo schema: parsear las mismas fórmulas 5 000 veces sería puro desperdicio.
 */
export function buildComputePlan(fields: DatasetField[]): ComputePlan {
  const live = liveFields(fields);
  const byKey = new Map(live.map((field) => [field.key, field]));
  const compiled = new Map<string, FormulaNode>();

  for (const field of live) {
    if (!field.formula) {
      continue;
    }

    const node = parseFormula(field.formula);

    for (const dependency of formulaDependencies(node)) {
      const target = byKey.get(dependency);

      // Una referencia a una columna que no existe NO es un error: es lo que pasa cuando el cliente
      // borra una columna de la que otra dependía. La fórmula sigue viva y su resultado queda en
      // `null` hasta que la restaure o corrija la fórmula.
      if (target && target.type !== 'number') {
        throw new BadRequestException(
          `La fórmula de "${field.label}" usa la columna "${target.label}", que no es numérica. ` +
            'Solo se puede calcular con columnas de tipo número.',
        );
      }
    }

    compiled.set(field.key, node);
  }

  const order: ComputePlan = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const labelOf = (key: string) => byKey.get(key)?.label ?? key;

  const visit = (key: string, trail: string[]): void => {
    if (state.get(key) === 'done') {
      return;
    }

    if (state.get(key) === 'visiting') {
      throw new BadRequestException(
        `Las fórmulas se referencian en círculo: ${[...trail, key].map(labelOf).join(' → ')}. ` +
          'Una columna calculada no puede depender de sí misma, ni directa ni indirectamente.',
      );
    }

    const node = compiled.get(key);

    // Una columna que no es calculada es una hoja: su valor lo capturó el cliente.
    if (!node) {
      return;
    }

    state.set(key, 'visiting');

    for (const dependency of formulaDependencies(node)) {
      visit(dependency, [...trail, key]);
    }

    state.set(key, 'done');
    order.push({ key, node });
  };

  for (const key of compiled.keys()) {
    visit(key, []);
  }

  return order;
}

/**
 * Aplica una edición de schema sobre el schema vigente, haciendo cumplir la regla aditiva.
 *
 * Devuelve la lista fusionada: las columnas que el cliente ya no manda quedan marcadas con
 * `deletedAt` en vez de desaparecer, para no perder los valores guardados en las filas.
 */
export function mergeFields(current: DatasetField[], incoming: DatasetField[]): DatasetField[] {
  validateFields(incoming);

  const currentByKey = new Map(current.map((field) => [field.key, field]));
  const incomingKeys = new Set(incoming.map((field) => field.key));
  const merged: DatasetField[] = [];

  incoming.forEach((field, index) => {
    const existing = currentByKey.get(field.key);

    if (existing && existing.type !== field.type) {
      throw new BadRequestException(
        `No se puede cambiar el tipo de "${existing.label}" (${existing.type} → ${field.type}) ` +
          'porque ya hay datos guardados con ese formato. Crea una columna nueva y copia los valores.',
      );
    }

    merged.push({
      ...field,
      order: index,
      // Volver a mandar una columna borrada la restaura, y sus valores siguen ahí.
      deletedAt: null,
    });
  });

  // Lo que el cliente omitió no se borra: se marca. Un borrado por error se deshace volviéndola
  // a agregar con la misma key.
  for (const field of current) {
    if (!incomingKeys.has(field.key)) {
      merged.push({
        ...field,
        deletedAt: field.deletedAt ?? new Date().toISOString(),
      });
    }
  }

  return merged;
}

/**
 * Valida y normaliza los valores de una fila contra el schema.
 *
 * Devuelve el objeto ya normalizado (números como números, fechas como `YYYY-MM-DD`, vacíos como
 * `null`) para guardarlo tal cual en `DatasetRecord.data`.
 *
 * **Aquí es donde se calculan las columnas con fórmula**, y por eso vale para los tres caminos de
 * escritura —alta, edición e importación de CSV— sin que ninguno tenga que saberlo.
 *
 * `plan` se puede pasar ya construido para no recompilar las fórmulas en cada fila de una
 * importación; si se omite se arma sobre la marcha.
 */
export function validateRecord(
  fields: DatasetField[],
  data: Record<string, unknown>,
  plan: ComputePlan = buildComputePlan(fields),
): Record<string, string | number | null> {
  const live = liveFields(fields);
  const byKey = new Map(live.map((field) => [field.key, field]));

  const unknownKeys = Object.keys(data).filter((key) => !byKey.has(key));
  if (unknownKeys.length > 0) {
    throw new BadRequestException(
      `Columnas que no existen en este dataset: ${unknownKeys.join(', ')}`,
    );
  }

  const normalized: Record<string, string | number | null> = {};

  for (const field of live) {
    // Una columna calculada ignora lo que traiga `data`: su valor sale de la fórmula, siempre.
    // Se ignora en silencio en lugar de fallar porque la rejilla del front manda la fila completa,
    // incluidas las celdas calculadas que ella misma pinta como solo lectura, y porque una columna
    // de más en un CSV no debe tumbar la importación entera.
    if (field.formula) {
      continue;
    }

    const raw = data[field.key];

    if (raw === undefined || raw === null || raw === '') {
      normalized[field.key] = null;
      continue;
    }

    normalized[field.key] = normalizeValue(field, raw);
  }

  // Segundo pase, en orden topológico: cada fórmula ve ya calculadas las columnas de las que
  // depende. Los operandos se leen de `normalized` —construido solo con las columnas VIVAS— y no
  // de `data`: una columna borrada conserva su valor dentro del JSON de la fila, así que resolver
  // contra `data` haría que una fórmula siguiera calculando con una columna que ya no existe para
  // nadie más.
  for (const { key, node } of plan) {
    normalized[key] = evaluateFormula(node, normalized);
  }

  return normalized;
}

function normalizeValue(field: DatasetField, raw: unknown): string | number {
  switch (field.type) {
    case 'number': {
      // El CSV y los formularios mandan strings; se guarda number para que el filtro por rango
      // pueda castear sin reventar.
      const value = typeof raw === 'number' ? raw : Number(String(raw).replace(/[\s,]/g, ''));

      if (!Number.isFinite(value)) {
        throw new BadRequestException(`"${field.label}" espera un número y recibió "${raw}"`);
      }

      return value;
    }

    case 'date': {
      const value = String(raw).trim().slice(0, 10);

      if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
        throw new BadRequestException(
          `"${field.label}" espera una fecha con formato AAAA-MM-DD y recibió "${raw}"`,
        );
      }

      return value;
    }

    case 'select': {
      const value = String(raw).trim();

      if (!(field.options ?? []).includes(value)) {
        throw new BadRequestException(
          `"${value}" no es una opción de "${field.label}". ` +
            `Opciones: ${(field.options ?? []).join(', ')}`,
        );
      }

      return value;
    }

    default: {
      const value = String(raw).trim();

      if (value.length > TEXT_MAX_LENGTH) {
        throw new BadRequestException(
          `"${field.label}" excede ${TEXT_MAX_LENGTH} caracteres`,
        );
      }

      return value;
    }
  }
}
