import { Body, Controller, Inject, OnModuleInit, Post } from '@nestjs/common';
import { ClientKafka, MessagePattern, Payload } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';

@Controller('gateway')
export class GatewayController implements OnModuleInit {

    constructor(@Inject("GATEWAY_KAFKA") private readonly kafkaService: ClientKafka) {}

    async onModuleInit() {
        this.kafkaService.subscribeToResponseOf("test.msg")
        await this.kafkaService.connect()
    }

    @Post('send-msg')
    async sendMessage(@Body() msg: any) {
        console.log("Sending msg to kafka")
        const response$ = this.kafkaService.send("test.msg", msg)
        const res = await firstValueFrom(response$)
        return { ok: true, res };
    }


}
