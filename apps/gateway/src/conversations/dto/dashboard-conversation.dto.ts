export class DashboardConversationDto {
  id: string;
  title: string | null;
  channel: string;
  status: string;
  isHumanInTheLoop: boolean;
  messageCount: number;
  lastMessageAt: Date | null;
  closedAt: Date | null;
  workflowId: string;
  userId: string | null;
}
