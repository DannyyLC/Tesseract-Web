/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.KAFKA,
    options: {
      client: {
        brokers:["20.81.187.131:9092"]
      },
      consumer: {

        groupId: "whatsapp_consumer_group"
      }
    }
  });

  await app.listen();
  
  Logger.log(
    `🚀 Application is listening to KAFKA`,
  );
}

bootstrap();
