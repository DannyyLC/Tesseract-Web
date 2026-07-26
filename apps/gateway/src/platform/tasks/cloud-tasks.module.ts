import { Module } from '@nestjs/common';
import { CloudTasksOidcGuard } from './cloud-tasks-oidc.guard';
import { CloudTasksService } from './cloud-tasks.service';

@Module({
  providers: [CloudTasksService, CloudTasksOidcGuard],
  exports: [CloudTasksService, CloudTasksOidcGuard],
})
export class CloudTasksModule {}
