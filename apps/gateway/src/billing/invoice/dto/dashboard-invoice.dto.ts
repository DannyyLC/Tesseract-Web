import { CfdiErrorKind, CfdiStatus, InvoiceStatus, InvoiceType } from '@tesseract/database';

export interface DashboardInvoiceDto {
  id: string;
  invoiceNumber: string;
  type: InvoiceType;
  status: InvoiceStatus;
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

  // CFDI. En organizaciones no mexicanas `cfdiStatus` es siempre NOT_APPLICABLE.
  cfdiStatus: CfdiStatus;
  cfdiUuid: string | null;
  cfdiStampedAt: Date | null;
  cfdiErrorKind: CfdiErrorKind | null;
}
