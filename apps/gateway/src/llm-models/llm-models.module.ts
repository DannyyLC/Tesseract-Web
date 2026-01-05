import { Module } from '@nestjs/common';
import { LlmModelsService } from './llm-models.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [LlmModelsService],
  exports: [LlmModelsService],
})
export class LlmModelsModule {}
