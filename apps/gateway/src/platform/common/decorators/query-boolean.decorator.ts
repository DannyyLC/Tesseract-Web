import { Transform } from 'class-transformer';

/**
 * Convierte un booleano que llega por query string (`'true'` / `'false'`) en `boolean`.
 *
 * No uses `@Type(() => Boolean)` para esto: hace `Boolean('false')`, que es `true` porque
 * cualquier texto no vacío lo es. Así `?includeDeleted=false` acababa incluyendo los borrados
 * y `?isActive=false` devolvía los activos. Cualquier otro valor se deja tal cual para que
 * `@IsBoolean()` lo rechace con un 400 en vez de aceptarlo en silencio.
 */
export function QueryBoolean(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  });
}
