import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './controllers/user-ui/users.controller';
import { UtilityModule } from '../utility/utility.module';

@Module({
  imports: [
    UtilityModule
  ],
  providers: [UsersService],
  exports: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}
