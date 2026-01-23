import { Module } from '@nestjs/common';
import { EndUsersService } from './end-users.service';
import { EndUsersController } from './end-users.controller';

@Module({
  providers: [EndUsersService],
  controllers: [EndUsersController],
})
export class EndUsersModule {}
