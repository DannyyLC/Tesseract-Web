import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getData() {
    return this.appService.getData();
  }

  @MessagePattern("order-created")
  handleOrderCreated(@Payload() order:any) {
    console.log("[Whatsapp Service ] received ", order)
    return {message:"kafka msg", order}
  }
}
