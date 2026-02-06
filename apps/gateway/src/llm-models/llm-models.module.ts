import { Module } from '@nestjs/common';
import { LlmModelsService } from './llm-models.service';
import { UtilityModule } from '../utility/utility.module';

@Module({
  imports: [
    UtilityModule
  ],
  providers: [LlmModelsService],
  exports: [LlmModelsService],
})
export class LlmModelsModule {}
