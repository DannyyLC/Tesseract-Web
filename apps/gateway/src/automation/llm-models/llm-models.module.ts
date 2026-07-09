import { Module } from '@nestjs/common';
import { LlmModelsService } from './llm-models.service';
import { LlmCategoriesService } from './llm-categories.service';
import { LlmModelsAdminController } from './controllers/llm-models.admin.controller';
import { LlmCategoriesAdminController } from './controllers/llm-categories.admin.controller';
import { UtilityModule } from '@/platform/utility/utility.module';

@Module({
  imports: [UtilityModule],
  controllers: [LlmModelsAdminController, LlmCategoriesAdminController],
  providers: [LlmModelsService, LlmCategoriesService],
  exports: [LlmModelsService, LlmCategoriesService],
})
export class LlmModelsModule {}
