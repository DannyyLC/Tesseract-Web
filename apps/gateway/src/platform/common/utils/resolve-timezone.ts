import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Zona horaria de último recurso cuando no hay ninguna válida en la cadena.
 *
 * No es `America/Mexico_City` a propósito: ese es el default de la columna
 * `organizations.timezone`, así que llegar aquí significa que la organización no se
 * cargó o traía basura. Devolver UTC deja el desfase a la vista en vez de disfrazarlo
 * de valor plausible.
 */
export const FALLBACK_TIMEZONE = 'UTC';

/**
 * Comprueba que `tz` sea un identificador IANA que Postgres y `Intl` acepten.
 *
 * `Intl.DateTimeFormat` lanza `RangeError` ante una zona desconocida, que es la única
 * validación disponible sin añadir una dependencia (el monorepo no tiene librería de
 * fechas en TS). Ojo: con `timeZone: undefined` no lanza, usa la del sistema — de ahí
 * el guardia previo sobre el tipo.
 */
export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.trim() === '') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resuelve la zona horaria efectiva de un workflow: la suya si la tiene, si no la de
 * su organización.
 *
 * `workflows.timezone` es nullable y NULL significa "hereda de la organización"; un
 * valor explícito es un override deliberado. `organizations.timezone` es NOT NULL, así
 * que en la práctica el segundo eslabón siempre responde salvo que quien llama olvide
 * incluir la relación en el `select`.
 *
 * Los valores inválidos se descartan en lugar de propagarse: la API acepta cualquier
 * string en `timezone` desde antes de que existiera validación, y una zona basura
 * llegando a un `AT TIME ZONE` revienta la consulta entera en vez de estropear solo
 * una gráfica.
 */
export function resolveTimezone(
  organizationTimezone?: string | null,
  workflowTimezone?: string | null,
): string {
  if (isValidTimezone(workflowTimezone)) return workflowTimezone;
  if (isValidTimezone(organizationTimezone)) return organizationTimezone;
  return FALLBACK_TIMEZONE;
}

/**
 * Valida en el borde que un campo del DTO sea una zona IANA.
 *
 * Hasta ahora `timezone` viajaba como `@IsString()` a secas en los DTOs de workflow y
 * de perfil, de modo que cualquier cadena acababa en la columna. Eso es inofensivo
 * mientras nadie la use, pero deja de serlo en cuanto alimenta un `AT TIME ZONE`.
 */
export const IsTimezone = (validationOptions?: ValidationOptions) => {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isTimezone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => isValidTimezone(value),
        defaultMessage: () => 'timezone debe ser un identificador IANA válido',
      },
    });
  };
};
