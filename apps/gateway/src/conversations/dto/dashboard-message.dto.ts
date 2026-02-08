export interface DashboardMessageDto {
  id: string;
  role: string;
  content: string;
  attachments: object | null;
  model: string | null;
  createdAt: Date;
}
