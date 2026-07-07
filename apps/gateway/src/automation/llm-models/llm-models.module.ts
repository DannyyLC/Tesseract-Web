import { Module } from '@nestjs/common';
import { LlmModelsService } from './llm-models.service';
import { LlmModelsAdminController } from './controllers/llm-models.admin.controller';
import { UtilityModule } from '@/platform/utility/utility.module';

@Module({
  imports: [UtilityModule],
  controllers: [LlmModelsAdminController],
  providers: [LlmModelsService],
  exports: [LlmModelsService],
})
export class LlmModelsModule {}
