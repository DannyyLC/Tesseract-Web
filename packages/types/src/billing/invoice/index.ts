// ============================================================
// Invoice — Shared types for invoice display
// ============================================================

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
}
