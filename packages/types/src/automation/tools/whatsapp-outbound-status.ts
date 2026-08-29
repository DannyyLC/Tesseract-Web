export interface WhatsappOutboundWorkflowNumberDto {
  whatsappConfigId: string;
  phoneNumber: string;
  displayName: string | null;
}

export interface WhatsappOutboundUnlinkedWorkflowDto {
  workflowId: string;
  workflowName: string;
  /** Every active WhatsAppConfig whose defaultWorkflowId points at this workflow. */
  whatsappNumbers: WhatsappOutboundWorkflowNumberDto[];
}

export interface WhatsappOutboundStatusDto {
  /** false => the org has zero WhatsAppConfig records; the catalog card should be grayed out. */
  hasWhatsappConfig: boolean;
  /** Existing "WhatsApp Outbound" TenantTool for this org, if one has been connected already. */
  tenantToolId: string | null;
  /**
   * Active WhatsAppConfig records that already have a defaultWorkflowId but whose
   * workflow isn't linked to the org's WhatsApp Outbound TenantTool yet.
   */
  unlinkedWorkflows: WhatsappOutboundUnlinkedWorkflowDto[];
}
