export interface MessageMetadata {
  is_hitl_bypass?: boolean;
  original_user_id?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
  metadata?: MessageMetadata;
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
  lastMessageAt: Date;
  workflowId: string;
  closedAt: Date | null;
  userId: string | null;
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
