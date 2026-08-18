/**
 * Catálogos del SAT necesarios para emitir un CFDI 4.0.
 *
 * **Son listas blancas de validación**, igual que `countries.ts`: el SAT rechaza el timbrado
 * si la clave no existe en su catálogo, así que una clave inventada no falla en el formulario
 * sino en el PAC, ya cobrada la factura.
 *
 * No están completos a propósito. El catálogo oficial `c_RegimenFiscal` tiene una veintena de
 * entradas, muchas de ellas irrelevantes para quien contrata un SaaS (sindicatos, fideicomisos
 * no empresariales, aportaciones de retiro). Se incluyen los regímenes que un cliente real
 * puede tener y se comenta el porqué. Añadir uno es una línea; quitarlo **no** es seguro
 * porque las organizaciones que ya lo tengan guardado dejarían de validar.
 *
 * Fuente: catálogos del Anexo 20 del SAT, vigentes para CFDI 4.0.
 */

/** A qué tipo de persona aplica un régimen. El SAT valida la combinación contra el RFC. */
export type TaxpayerType = 'fisica' | 'moral' | 'ambas';

export interface TaxRegimeOption {
  /** Clave del catálogo `c_RegimenFiscal`. */
  code: string;
  /** Descripción oficial del SAT. La UI la muestra tal cual: es la que aparece en la CSF. */
  description: string;
  appliesTo: TaxpayerType;
}

/**
 * Regímenes fiscales admitidos para el receptor.
 *
 * El orden es el de frecuencia esperada entre clientes de un SaaS B2B, no el numérico: el
 * 601 (persona moral normal) y el 612 (persona física con actividad empresarial) cubren la
 * enorme mayoría.
 */
export const TAX_REGIMES: TaxRegimeOption[] = [
  { code: '601', description: 'General de Ley Personas Morales', appliesTo: 'moral' },
  {
    code: '612',
    description: 'Personas Físicas con Actividades Empresariales y Profesionales',
    appliesTo: 'fisica',
  },
  { code: '626', description: 'Régimen Simplificado de Confianza', appliesTo: 'ambas' },
  { code: '621', description: 'Incorporación Fiscal', appliesTo: 'fisica' },
  { code: '625', description: 'Actividades Empresariales con ingresos a través de Plataformas Tecnológicas', appliesTo: 'fisica' },
  { code: '603', description: 'Personas Morales con Fines no Lucrativos', appliesTo: 'moral' },
  { code: '606', description: 'Arrendamiento', appliesTo: 'fisica' },
  { code: '620', description: 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos', appliesTo: 'moral' },
];

export interface CfdiUseOption {
  /** Clave del catálogo `c_UsoCFDI`. */
  code: string;
  description: string;
  appliesTo: TaxpayerType;
}

/**
 * Usos del CFDI admitidos.
 *
 * `G03` (gastos en general) es el default y lo que corresponde a un servicio de software para
 * la práctica totalidad de los casos. Se ofrecen las otras dos porque hay contadores que
 * prefieren clasificar el gasto de otra forma, pero **el SAT valida el uso contra el régimen
 * del receptor**: una combinación imposible se rechaza al timbrar. Por eso la lista es corta.
 */
export const CFDI_USES: CfdiUseOption[] = [
  { code: 'G03', description: 'Gastos en general', appliesTo: 'ambas' },
  { code: 'G01', description: 'Adquisición de mercancías', appliesTo: 'ambas' },
  { code: 'I04', description: 'Equipo de cómputo y accesorios', appliesTo: 'ambas' },
  { code: 'S01', description: 'Sin efectos fiscales', appliesTo: 'ambas' },
];

/** Uso del CFDI por defecto cuando el cliente no elige otro. */
export const DEFAULT_CFDI_USE = 'G03';

export const TAX_REGIME_CODES: string[] = TAX_REGIMES.map((r) => r.code);
export const CFDI_USE_CODES: string[] = CFDI_USES.map((u) => u.code);

export function isValidTaxRegime(code: string): boolean {
  return TAX_REGIME_CODES.includes(code);
}

export function isValidCfdiUse(code: string): boolean {
  return CFDI_USE_CODES.includes(code);
}

/**
 * Longitud del RFC según el tipo de persona: 13 caracteres para persona física (incluye el
 * día de nacimiento), 12 para persona moral.
 *
 * La expresión valida estructura, no existencia. Un RFC bien formado puede no estar en el
 * padrón del SAT — eso solo lo sabe el PAC al validarlo, y por eso el perfil fiscal guarda
 * `validatedAt` en vez de confiar en esta comprobación.
 */
export const RFC_PATTERN = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/;

/** Código postal mexicano: cinco dígitos. */
export const MEXICAN_ZIP_PATTERN = /^\d{5}$/;

export function isValidRfc(rfc: string): boolean {
  return RFC_PATTERN.test(rfc);
}

/**
 * Normaliza un RFC a la forma en la que se guarda: mayúsculas y sin espacios ni guiones.
 *
 * Se aplica en el transform del DTO, una sola vez, igual que la normalización de correos.
 * Los clientes lo escriben de todas las formas imaginables ("abc-123456-xy1", con espacios,
 * en minúsculas) y compararlo sin normalizar produce duplicados que el SAT rechaza.
 */
export function normalizeRfc(rfc: string): string {
  return rfc.replace(/[\s-]/g, '').toUpperCase();
}
