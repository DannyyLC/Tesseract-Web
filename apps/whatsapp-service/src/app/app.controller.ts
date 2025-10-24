import { Controller, Get, Inject } from '@nestjs/common';
import { AppService } from './app.service';
import { ClientKafka, MessagePattern, Payload } from '@nestjs/microservices';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService, @Inject("GATEWAY_KAFKA") private readonly kafkaService: ClientKafka) {}

  @Get()
  getData() {
    return this.appService.getData();
  }


    @MessagePattern('test.msg')
    async handleTestMsg(@Payload() msg: any) {
        console.log("Whatsapp service received a msg from the topic test-msg ", msg)
        return { message: "msg proccessed successfully ",msg}
    }

}
