import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsString, isString } from 'class-validator';

export class CreateTenantToolDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'ID of the tool catalog to link', example: 'tool-catalog-uuid' })
  toolCatalogId: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Display name for this tenant tool', example: 'Google Calendar - Sales' })
  displayName: string;

  @IsObject()
  @ApiPropertyOptional({ description: 'Custom configuration for the tenant tool', example: '{ "portal_id": "123", "default_pipeline": "ventas" }'})
  config?: any;

  @IsObject()
  @ApiPropertyOptional({ description: 'Allowed functions for this tenant tool', example: '["list_events", "create_event"]', nullable: true })
  allowedFunctions?: any;

  @IsString()
  @ApiPropertyOptional({ description: 'Workflow ID to connect', example: 'workflow-uuid', nullable: true })
  workflowId?: string | null;
}
