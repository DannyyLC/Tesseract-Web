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

  @IsString()
  @ApiPropertyOptional({ description: 'Credential path in secret manager', example: 'projects/tesseract/secrets/org-123-hubspot', nullable: true })
  credentialPath?: string | null;

  @IsObject()
  @ApiPropertyOptional({ description: 'Custom configuration for the tenant tool', example: '{ "portal_id": "123", "default_pipeline": "ventas" }'})
  config?: any;

  @IsString()
  @ApiPropertyOptional({ description: 'OAuth provider for the tool', example: 'google', nullable: true })
  oauthProvider?: string | null;

  @IsString()
  @ApiPropertyOptional({ description: 'Workflow ID to connect', example: 'workflow-uuid', nullable: true })
  workflowId?: string | null;
}
