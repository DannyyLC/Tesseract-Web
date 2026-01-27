import { Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { DatabaseModule } from '../database/database.module';
import { OrganizationsController } from './controllers/user-ui/organizations.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
