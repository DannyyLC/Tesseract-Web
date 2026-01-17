import { forwardRef, Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { UsersService } from './users.service';
import { UsersController } from './controllers/user-ui/users/users.controller';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [
    DatabaseModule, 
    AuthModule, 
    OrganizationsModule],
  providers: [UsersService],
  exports: [UsersService],
  controllers: [
    UsersController
  ],
})
export class UsersModule {}
