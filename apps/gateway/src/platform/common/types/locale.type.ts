export type SupportedLocale = 'es' | 'en';

export const DEFAULT_LOCALE: SupportedLocale = 'es';

/**
 * El front manda el locale activo en `X-Locale` (ver `api-request-manager.ts`). No hay
 * preferencia persistida en BD a propósito: el idioma vive en la URL/cookie de next-intl,
 * nunca en el usuario ni en la organización.
 */
export function resolveLocale(value: unknown): SupportedLocale {
  return value === 'en' ? 'en' : DEFAULT_LOCALE;
}
