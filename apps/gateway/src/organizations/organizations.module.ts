import { Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { DatabaseModule } from '../database/database.module';
import { CreditsModule } from '@/credits/credits.module';
import { UsersModule } from '@/users/users.module';

@Module({
  imports: [DatabaseModule, CreditsModule, UsersModule],
  controllers: [],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
