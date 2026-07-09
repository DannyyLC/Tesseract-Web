import { PartialType } from '@nestjs/swagger';
import { CreateLlmCategoryDto } from './create-llm-category.dto';

export class UpdateLlmCategoryDto extends PartialType(CreateLlmCategoryDto) {}
