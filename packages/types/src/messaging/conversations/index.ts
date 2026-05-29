export interface MessageMetadata {
  is_hitl_bypass?: boolean;
  original_user_id?: string;
}

export type MessageAttachmentType = 'IMAGE' | 'AUDIO';
export type MessageAttachmentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'FAILED'
  | 'UNSUPPORTED';

export interface MessageAttachment {
  id: string;
  type: MessageAttachmentType;
  mimeType: string;
  sourceUrl: string;
  sizeBytes?: number | null;
  sha256?: string | null;
  contentHash?: string | null;
  processingStatus: MessageAttachmentStatus;
  processedText?: string | null;
  processedAt?: Date | null;
  processingError?: string | null;
  processor?: string | null;
  processorVersion?: string | null;
  metadata?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
  metadata?: MessageMetadata;
  attachments?: MessageAttachment[];
}

export interface ConversationDto {
  id: string;
  title?: string;
  messages: Message[];
  workflowId?: string;
}

export interface ConversationDetailDto {
  id: string;
  title: string | null;
  channel: string;
  status: string;
  isHumanInTheLoop: boolean;
  messageCount: number;
  lastMessageAt: Date | null;
  createdAt: Date;
  closedAt: Date | null;
  workflowId: string;
  userId: string | null;
  endUserId: string | null;
  messages: Message[];
}

export interface DashboardConversationDto {
  id: string;
  title: string | null;
  channel: string;
  status: string; // 'open' | 'closed' | 'snoozed' etc.
  isHumanInTheLoop: boolean;
  messageCount: number;
  lastMessageAt: Date | null;
  workflowId: string;
  closedAt: Date | null;
  userId: string | null;
  organizationId: string | null;
  isInternal: boolean;
}

export interface UpdateConversationDto {
  title?: string;
  status?: string;
  isHumanInTheLoop?: boolean;
}

export interface ConversationsStatsDto {
  totalConversations: number;
  activeConversations: number;
  totalMessagesMonth: number;
}
