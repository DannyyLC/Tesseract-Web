import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class WorkflowIdsDto {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ description: 'List of workflow IDs to associate. This will overwrite existing associations.', example: ['uuid-1', 'uuid-2'] })
  workflowIds: string[];
}