/**
 * Locale de `Intl`/`toLocaleString` a partir del locale de next-intl (`useLocale()`). Los
 * separadores de miles/decimales y el orden de fecha cambian entre variantes de un mismo
 * idioma (`es-MX` vs `es-ES`), así que se fija una sola variante por idioma en vez de dejar
 * que cada componente elija la suya.
 */
export function toIntlLocale(locale: string): string {
  return locale === 'en' ? 'en-US' : 'es-MX';
}
