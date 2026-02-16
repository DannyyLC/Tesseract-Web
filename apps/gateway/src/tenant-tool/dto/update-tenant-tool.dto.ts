import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsDate, IsArray, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateTenantToolDto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Display name for this tenant tool', example: 'Google Calendar - Sales' })
  displayName?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Credential path in secret manager', example: 'projects/tesseract/secrets/org-123-hubspot', nullable: true })
  credentialPath?: string | null;

  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({ description: 'Custom configuration for the tenant tool', example: '{ "portal_id": "123", "default_pipeline": "ventas" }' })
  config?: any;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'OAuth provider for the tool', example: 'google', nullable: true })
  oauthProvider?: string | null;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'Connection status', example: true })
  isConnected?: boolean;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Last connection error', example: 'Invalid credentials', nullable: true })
  connectionError?: string | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @ApiPropertyOptional({ description: 'Date when connected', example: '2026-02-15T12:00:00Z', nullable: true })
  connectedAt?: Date | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @ApiPropertyOptional({ description: 'Date when last used', example: '2026-02-15T12:00:00Z', nullable: true })
  lastUsedAt?: Date | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  @ApiPropertyOptional({ description: 'Date when token expires', example: '2026-02-15T12:00:00Z', nullable: true })
  tokenExpiresAt?: Date | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiPropertyOptional({ description: 'Array of workflow IDs to connect', example: ['workflow-uuid-1', 'workflow-uuid-2'], type: [String] })
  workflows?: string[];
}
