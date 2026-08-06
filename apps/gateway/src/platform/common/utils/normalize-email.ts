import { Transform } from 'class-transformer';

/**
 * Deja un email en su forma canónica: sin espacios alrededor y en minúsculas.
 *
 * `users.email` es único, así que sin esto `Juan@Empresa.com` y `juan@empresa.com`
 * conviven como dos cuentas distintas. El caso que más duele es el login con Google:
 * Google siempre entrega el email en minúsculas, de modo que quien se registró a mano
 * con mayúsculas no se encuentra al volver por OAuth y termina con una segunda cuenta
 * en otra organización.
 *
 * Formalmente la parte local es sensible a mayúsculas (RFC 5321), pero ningún proveedor
 * real lo aplica y los usuarios esperan poder escribir su correo como les salga.
 */
export function normalizeEmail(email: string): string;
export function normalizeEmail(email: null | undefined): undefined;
export function normalizeEmail(email?: string | null): string | undefined;
export function normalizeEmail(email?: string | null): string | undefined {
  if (typeof email !== 'string') return undefined;
  return email.trim().toLowerCase();
}

/**
 * Aplica {@link normalizeEmail} al campo de un DTO antes de validarlo.
 *
 * Se normaliza aquí, en el borde, y no en cada consulta: hay quince búsquedas por email
 * repartidas por el gateway y repetir la regla en todas es la vía rápida a que alguna se
 * quede atrás.
 *
 * Requiere `transform: true` en el ValidationPipe global (ya activo en `main.ts`).
 */
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  );
