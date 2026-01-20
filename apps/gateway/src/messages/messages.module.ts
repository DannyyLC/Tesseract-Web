import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesController } from './controllers/user-ui/messages.controller';

@Module({
  providers: [MessagesService],
  controllers: [MessagesController]
})
export class MessagesModule {}
