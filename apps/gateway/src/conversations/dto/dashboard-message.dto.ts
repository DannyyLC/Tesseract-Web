export interface DashboardMessageDto {
  role: string;
  content: string;
  attachments: object | null;
  model: string | null;
  createdAt: Date;
}
