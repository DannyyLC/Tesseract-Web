import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { OrganizationsController } from './controllers/user-ui/organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [DatabaseModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
