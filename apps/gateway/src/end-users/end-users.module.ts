import { Module } from '@nestjs/common';
import { EndUsersService } from './end-users.service';
import { EndUsersController } from './controller/end-users.controller';
import { UtilityModule } from '../utility/utility.module';

@Module({
  imports: [UtilityModule],
  providers: [EndUsersService],
  controllers: [EndUsersController],
})
export class EndUsersModule {}
