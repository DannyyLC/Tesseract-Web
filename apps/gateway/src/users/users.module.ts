import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { AuthModule } from '@/auth/auth.module';
import { UsersService } from './users.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
