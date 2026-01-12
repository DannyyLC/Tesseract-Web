import { Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { DatabaseModule } from '../database/database.module';
import { OrganizationsController } from './controllers/user-ui/organizations/organizations.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
