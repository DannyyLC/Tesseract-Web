import { Transform } from 'class-transformer';

/**
 * Forma canónica de un teléfono: `+` seguido de sus dígitos.
 *
 * Es lo ÚNICO que se puede escribir en la base. No pierde información —solo quita espacios,
 * guiones, paréntesis y puntos— así que el resultado sigue siendo E.164 válido y sirve tal cual
 * como remitente hacia YCloud. Es idempotente: aplicarla dos veces da lo mismo.
 *
 *   +52 55 1234 5678  -> +525512345678
 *   (55) 1234-5678    -> +5512345678
 *   525512345678      -> +525512345678
 *
 * Ojo con lo que NO hace: no decide país ni agrega lada. `5512345678` se vuelve `+5512345678`,
 * que no es el mismo número que `+525512345678`. Adivinar el país aquí sería inventar dígitos.
 */
export function normalizePhone(phone: string): string;
export function normalizePhone(phone: null | undefined): undefined;
export function normalizePhone(phone?: string | null): string | undefined;
export function normalizePhone(phone?: string | null): string | undefined {
  if (typeof phone !== 'string') return undefined;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return undefined;
  return `+${digits}`;
}

/** Lada de México. La única con regla de equivalencia por ahora; ver {@link phoneNumberVariants}. */
const MX_COUNTRY_CODE = '52';
/** Longitud de un número mexicano completo sin el `1` de móvil: 52 + 10 dígitos. */
const MX_NATIONAL_LENGTH = 12;

/**
 * Todas las formas con las que el mismo número real puede estar guardado.
 *
 * **Solo para el `where` de una consulta. Nunca para un `data`.** A diferencia de
 * {@link normalizePhone}, esto sí altera el número —le quita o le pone el `1` de móvil mexicano—
 * y escribir una variante cambiaría el remitente que se le manda a YCloud.
 *
 * Existe porque los dos lados de la comparación vienen de fuentes distintas: el número guardado lo
 * teclea una persona en la UI o en el admin, y el que llega por el webhook lo escribe YCloud. Si no
 * empatan carácter por carácter, la config sale `null`, el webhook responde 200 y el mensaje del
 * cliente se pierde sin un solo error en los logs.
 *
 * El caso que de verdad muerde es México: WhatsApp arrastra el `1` de móvil (`+521 55…`) mientras
 * que a mano se captura sin él (`+52 55…`). Ese dígito no es parte del número del suscriptor —es un
 * marcador heredado— así que las dos formas son la misma persona y tienen que empatar.
 *
 * La regla se limita al código 52 a propósito. Argentina tiene un `9` análogo, pero no hay
 * operación ahí y una equivalencia de más puede hacer empatar dos números que no son el mismo.
 * Cuando haga falta, el `warn` de `getWhatsappConfigByPhoneNumber` lo va a delatar.
 */
export function phoneNumberVariants(phone?: string | null): string[] {
  const canonical = normalizePhone(phone);
  if (!canonical) return [];

  const digits = canonical.slice(1);
  const forms = new Set<string>([digits]);

  if (digits.startsWith(`${MX_COUNTRY_CODE}1`) && digits.length === MX_NATIONAL_LENGTH + 1) {
    forms.add(MX_COUNTRY_CODE + digits.slice(MX_COUNTRY_CODE.length + 1));
  } else if (digits.startsWith(MX_COUNTRY_CODE) && digits.length === MX_NATIONAL_LENGTH) {
    forms.add(`${MX_COUNTRY_CODE}1${digits.slice(MX_COUNTRY_CODE.length)}`);
  }

  // Cada forma con y sin `+`: la columna no tiene formato obligatorio, así que ambas conviven.
  return [...forms].flatMap((form) => [`+${form}`, form]);
}

/**
 * Aplica {@link normalizePhone} al campo de un DTO antes de validarlo.
 *
 * Se normaliza en el borde y no en cada consulta, igual que `NormalizeEmail`: así toda fila nueva
 * nace canónica y el desajuste de formatos deja de crecer. Lo que ya está guardado torcido lo
 * resuelve `phoneNumberVariants` del lado de la lectura.
 *
 * Requiere `transform: true` en el ValidationPipe global (ya activo en `main.ts`).
 */
export const NormalizePhone = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? (normalizePhone(value) ?? value) : value,
  );
