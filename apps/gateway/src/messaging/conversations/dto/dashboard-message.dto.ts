import { MessageAttachment } from '@tesseract/types';

export interface DashboardMessageDto {
  id: string;
  role: string;
  content: string;
  attachments: MessageAttachment[];
  model: string | null;
  createdAt: Date;
}
