import { registerDecorator, ValidationOptions } from 'class-validator';
import { isSupportedCountry } from '@tesseract/types';

/**
 * Valida en el borde que un campo del DTO sea un país que sepamos facturar.
 *
 * A diferencia de `IsTimezone`, que acepta cualquier identificador IANA, este validador se
 * apoya en una lista cerrada (`SUPPORTED_COUNTRIES` en `@tesseract/types`). La razón es que el
 * país no es decorativo: decide la moneda de cobro. Un código fuera del catálogo no tiene
 * moneda asignada, así que aceptarlo significaría cobrarle a alguien en la moneda de respaldo
 * sin haberlo decidido nadie.
 *
 * La lógica vive en `@tesseract/types` y no aquí porque el front necesita el mismo mapeo para
 * pintar los precios; este archivo solo aporta el envoltorio de class-validator, que es una
 * dependencia del gateway.
 */
export const IsCountry = (validationOptions?: ValidationOptions) => {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isCountry',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => isSupportedCountry(value),
        defaultMessage: () =>
          'country debe ser un código ISO 3166-1 alpha-2 de los países soportados',
      },
    });
  };
};
