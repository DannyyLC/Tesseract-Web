import { MessageAttachment } from '@tesseract/types';

export class ConversationMessageDto {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
  attachments?: MessageAttachment[];
}
