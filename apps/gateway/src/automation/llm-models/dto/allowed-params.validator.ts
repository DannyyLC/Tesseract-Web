import { registerDecorator, ValidationOptions } from 'class-validator';

/** Nombre de parámetro del proveedor: `reasoning_effort`, `top_k`, … */
const PARAM_NAME = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * `allowedParams` de un modelo: `{ "<param>": ["valor", ...] }`.
 *
 * Lista vacía = cualquier valor. Lo que se guarda aquí decide qué `model_params` acepta
 * el validador de workflows y, por tanto, qué manda el motor tal cual al proveedor
 * (`allowed_openai_params`), así que se exige una forma estricta: nombres en snake_case
 * y valores string sin vacíos.
 */
export function IsAllowedParams(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAllowedParams',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
          return Object.entries(value).every(
            ([name, values]) =>
              PARAM_NAME.test(name) &&
              Array.isArray(values) &&
              values.every((v) => typeof v === 'string' && v.trim() !== ''),
          );
        },
        defaultMessage(): string {
          return 'allowedParams debe ser un objeto { "<parametro_snake_case>": ["valor", ...] } (lista vacía = cualquier valor)';
        },
      },
    });
  };
}
