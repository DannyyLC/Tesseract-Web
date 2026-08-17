import { Module } from '@nestjs/common';
import { EndUsersService } from './end-users.service';
import { EndUsersController } from './controller/end-users.controller';
import { UtilityModule } from '@/platform/utility/utility.module';

@Module({
  imports: [UtilityModule],
  providers: [EndUsersService],
  controllers: [EndUsersController],
  // Lo consumen los webhooks de cada canal para descartar lo que mande un contacto bloqueado.
  exports: [EndUsersService],
})
export class EndUsersModule {}
