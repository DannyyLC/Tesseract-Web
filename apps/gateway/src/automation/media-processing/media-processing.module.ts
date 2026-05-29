import { Module } from '@nestjs/common';
import { MEDIA_PROCESSOR_ADAPTER } from './adapters/media-processor.adapter';
import { OpenAiCompatibleMediaProcessorAdapter } from './adapters/openai-compatible-media-processor.adapter';
import { MediaProcessingService } from './media-processing.service';

@Module({
  providers: [
    OpenAiCompatibleMediaProcessorAdapter,
    {
      provide: MEDIA_PROCESSOR_ADAPTER,
      useExisting: OpenAiCompatibleMediaProcessorAdapter,
    },
    MediaProcessingService,
  ],
  exports: [MediaProcessingService],
})
export class MediaProcessingModule {}
