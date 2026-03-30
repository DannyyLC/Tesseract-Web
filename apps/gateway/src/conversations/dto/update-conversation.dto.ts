import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { UpdateConversationDto as IUpdateConversationDto } from '@tesseract/types';

export class UpdateConversationDto implements IUpdateConversationDto {
  @IsOptional()
  @IsBoolean()
  isHumanInTheLoop?: boolean;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  title?: string;
}
