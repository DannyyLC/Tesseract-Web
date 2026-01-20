import { MessagesService } from '../../messages.service';
import { Controller } from '@nestjs/common';

@Controller('messages')
export class MessagesController {
    constructor(
        private readonly messagesService: MessagesService
    ) {}
    
}
