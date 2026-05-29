import { Module } from '@nestjs/common';
import { ConversationsModule } from './conversations/conversations.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WhatsappConfigModule } from './channels/whatsapp-config/whatsapp-config.module';

/**
 * Dominio conversacional + omnicanal. Agrupa y reexporta sus submódulos:
 * conversaciones, notificaciones y los canales (hoy WhatsApp).
 */
@Module({
  imports: [ConversationsModule, NotificationsModule, WhatsappConfigModule],
  exports: [ConversationsModule, NotificationsModule, WhatsappConfigModule],
})
export class MessagingModule {}
