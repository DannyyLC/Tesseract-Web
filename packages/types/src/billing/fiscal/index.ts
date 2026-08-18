// ============================================================
// Fiscal — Datos fiscales y catálogos del SAT (CFDI 4.0)
// ============================================================

export * from './sat-catalogs';

/** Perfil fiscal tal como lo consume el front. */
export interface FiscalProfileDto {
  rfc: string;
  legalName: string;
  zipCode: string;
  taxRegime: string;
  cfdiUse: string;
  email: string;
  /**
   * En NULL significa que el PAC todavía no ha aceptado estos datos contra el padrón del
   * SAT. Mientras siga así no se intenta timbrar: el SAT rechazaría la factura.
   */
  validatedAt: Date | null;
}

/** Cuerpo del PUT del perfil fiscal. */
export interface UpsertFiscalProfileDto {
  rfc: string;
  legalName: string;
  zipCode: string;
  taxRegime: string;
  cfdiUse?: string;
  email: string;
}
