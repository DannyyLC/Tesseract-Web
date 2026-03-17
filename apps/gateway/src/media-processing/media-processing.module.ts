import { Module } from '@nestjs/common';
import { BasicMediaProcessorAdapter } from './adapters/basic-media-processor.adapter';
import { MediaProcessingService } from './media-processing.service';

@Module({
  providers: [BasicMediaProcessorAdapter, MediaProcessingService],
  exports: [MediaProcessingService],
})
export class MediaProcessingModule {}
