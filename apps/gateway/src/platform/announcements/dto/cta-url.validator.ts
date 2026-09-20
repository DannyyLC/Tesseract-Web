import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Acepta solo una ruta relativa interna (`/billing`) o una URL absoluta `https://`.
 *
 * `@IsUrl()` a secas rechaza `/billing` (exige esquema+host), y sin este validador
 * `ctaUrl` viajaría como texto libre hasta un `<a href>` en el modal de cada inquilino:
 * un operador que pegara `javascript:alert(1)` ahí crearía un XSS que corre para
 * todos los usuarios que abran el anuncio.
 */
export function IsCtaUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCtaUrl',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || value.trim() === '') return false;
          if (value.startsWith('/')) return true;
          try {
            return new URL(value).protocol === 'https:';
          } catch {
            return false;
          }
        },
        defaultMessage(): string {
          return 'ctaUrl debe ser una ruta relativa que empiece con "/" o una URL absoluta https://';
        },
      },
    });
  };
}
