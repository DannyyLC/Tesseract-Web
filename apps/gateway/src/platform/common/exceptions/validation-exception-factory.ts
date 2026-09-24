import { ValidationError } from '@nestjs/common';
import { ValidationErrorException } from './business/validation.exceptions';

interface FieldError {
  field: string;
  constraints: string[];
}

/**
 * Aplana los `ValidationError` de class-validator (incluyendo los anidados de `children`,
 * ej. un DTO con un objeto o array embebido) a `{field, constraints}[]`.
 *
 * Usamos las CLAVES de `error.constraints` (ej. "isEmail", "minLength"), no sus valores.
 * Las claves las define class-validator por el nombre del validador que falló y son
 * estables sin importar si el DTO puso un `message:` custom en el decorador — eso es lo
 * que permite traducir en el front sin tocar los ~76 DTOs uno por uno.
 */
function flatten(errors: ValidationError[], parentPath = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const own = error.constraints ? [{ field, constraints: Object.keys(error.constraints) }] : [];
    const nested = error.children?.length ? flatten(error.children, field) : [];
    return [...own, ...nested];
  });
}

/**
 * `exceptionFactory` del `ValidationPipe` global (ver `main.ts`). Sustituye el `message`
 * de texto libre de class-validator por una lista estructurada por campo, para que el
 * front resuelva el texto visible vía next-intl en vez de mostrar el string que trae el
 * decorador (que hoy mezcla español e inglés según el DTO).
 */
export function validationExceptionFactory(errors: ValidationError[]): ValidationErrorException {
  return new ValidationErrorException(flatten(errors));
}
