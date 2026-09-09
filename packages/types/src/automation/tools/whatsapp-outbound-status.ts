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

export interface WhatsappOutboundLinkedWorkflowDto {
  workflowId: string;
  workflowName: string;
  /** Every active WhatsAppConfig whose defaultWorkflowId points at this workflow (2+, always). */
  whatsappNumbers: WhatsappOutboundWorkflowNumberDto[];
  /**
   * Which of `whatsappNumbers` the send_bulk_whatsapp tool uses as sender when the conversation
   * ISN'T on WhatsApp (API/Messenger never carry a destination number to disambiguate — a
   * WhatsApp conversation always uses the number it arrived on, this setting never overrides
   * that). `null` = nobody picked one yet, falls back to the first configured number.
   */
  defaultWhatsappConfigId: string | null;
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
  /**
   * Already-linked workflows with more than one WhatsApp number — only these need a default
   * sender picked; a single-number workflow has nothing to disambiguate.
   */
  linkedWorkflowsNeedingDefault: WhatsappOutboundLinkedWorkflowDto[];
}
