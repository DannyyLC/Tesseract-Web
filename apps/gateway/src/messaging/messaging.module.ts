import { Module } from '@nestjs/common';
import { ConversationsModule } from './conversations/conversations.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WhatsappConfigModule } from './channels/whatsapp-config/whatsapp-config.module';
import { MessengerModule } from './channels/messenger/messenger.module';

/**
 * Dominio conversacional + omnicanal. Agrupa y reexporta sus submódulos:
 * conversaciones, notificaciones y los canales (hoy WhatsApp y Messenger).
 */
@Module({
  imports: [ConversationsModule, NotificationsModule, WhatsappConfigModule, MessengerModule],
  exports: [ConversationsModule, NotificationsModule, WhatsappConfigModule, MessengerModule],
})
export class MessagingModule {}
