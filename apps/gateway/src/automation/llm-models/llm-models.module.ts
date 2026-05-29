import { Module } from '@nestjs/common';
import { LlmModelsService } from './llm-models.service';
import { UtilityModule } from '@/platform/utility/utility.module';

@Module({
  imports: [UtilityModule],
  providers: [LlmModelsService],
  exports: [LlmModelsService],
})
export class LlmModelsModule {}
