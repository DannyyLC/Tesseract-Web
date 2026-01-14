import { InvoiceStatus, InvoiceType } from "@workflow-platform/database";

export interface DashboardInvoiceDto {
    id: string;
    organizationId: string;
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
}