/** Categorías del catálogo que tienen traducción en `Integrations.categories`. */
const KNOWN_TOOL_CATEGORIES = new Set([
  'utility',
  'escalation',
  'messaging',
  'data',
  'productivity',
  'chat',
  'general',
]);

/** Etiqueta traducida de una categoría; si es una que no conocemos, se muestra tal cual. */
export function toolCategoryLabel(
  category: string,
  t: (key: string) => string,
): string {
  return KNOWN_TOOL_CATEGORIES.has(category) ? t(`categories.${category}`) : category;
}
