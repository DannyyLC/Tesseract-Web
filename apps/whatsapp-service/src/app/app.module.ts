import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'GATEWAY_KAFKA',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'gateway',
            brokers: ['20.81.187.131:9092'],
          }
        },
      },
    ]),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
