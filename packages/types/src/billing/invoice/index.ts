// ============================================================
// Invoice — Shared types for invoice display
// ============================================================

/**
 * Estado del CFDI de una factura, en el mismo orden que el enum de Prisma.
 *
 * Se redeclara aquí en vez de importarlo de `@tesseract/database` porque el front consume
 * este paquete y no puede depender del cliente de Prisma.
 */
export type CfdiStatusDto = 'NOT_APPLICABLE' | 'PENDING' | 'STAMPING' | 'STAMPED' | 'FAILED';

/**
 * De quién es la culpa de que el timbrado fallara. Es lo que decide qué ve el cliente:
 * con `CLIENT_DATA` se le pide corregir sus datos y se le ofrece regenerar; con `INTERNAL`
 * no puede hacer nada, así que se le informa y **no** se le da un botón que fallaría igual.
 */
export type CfdiErrorKindDto = 'CLIENT_DATA' | 'INTERNAL';

export interface DashboardInvoiceDto {
  id: string;
  invoiceNumber: string;
  type: string;
  status: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  subtotal: number;
  overageAmount: number;
  tax: number;
  total: number;
  stripeHostedUrl: string | null;
  stripePdfUrl: string | null;
  paidAt: Date | null;
  dueAt: Date | null;

  // CFDI (SAT). En organizaciones no mexicanas `cfdiStatus` es siempre NOT_APPLICABLE y el
  // front no muestra nada de esta sección.
  cfdiStatus: CfdiStatusDto;
  cfdiUuid: string | null;
  cfdiStampedAt: Date | null;
  cfdiErrorKind: CfdiErrorKindDto | null;
}
