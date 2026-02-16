import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsString } from "class-validator";

export class WorkflowIdsDto {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({ description: 'Array of workflow IDs to add', example: ['workflow-uuid-1', 'workflow-uuid-2'], type: [String] })
  workflowIds: string[];
}