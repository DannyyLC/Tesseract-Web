import { Transform } from 'class-transformer';
import { normalizeRfc } from '@tesseract/types';

/**
 * Aplica la normalización del RFC al campo de un DTO antes de validarlo.
 *
 * Mismo criterio que {@link NormalizeEmail}: se normaliza en el borde y una sola vez, no en
 * cada consulta. Los clientes escriben su RFC como les sale —con guiones, con espacios, en
 * minúsculas— y el SAT solo reconoce una forma. Guardar la que llegó significa que el
 * timbrado falla y nadie entiende por qué, porque a ojo el RFC "está bien".
 *
 * La regla vive en `@tesseract/types` para que el front pueda mostrar el mismo valor
 * canónico que se va a guardar.
 *
 * Requiere `transform: true` en el ValidationPipe global (ya activo en `main.ts`).
 */
export const NormalizeRfc = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeRfc(value) : value,
  );
