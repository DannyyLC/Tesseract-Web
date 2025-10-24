import { Body, Controller, Inject, OnModuleInit, Post } from '@nestjs/common';
import { ClientKafka, MessagePattern, Payload } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';

@Controller('gateway')
export class GatewayController {

    constructor(@Inject("GATEWAY_KAFKA") private readonly kafkaService: ClientKafka) {}



    @Post('send-msg')
    async sendMessage(@Body() msg: any) {
        console.log("Sending msg to kafka")
        this.kafkaService.emit("test.msg", msg)
        return { ok: true, msg };
    }


}
