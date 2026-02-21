import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpsertCredentialsDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'OAuth Provider (e.g. google)', example: 'google' })
  provider: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Access Token to encrypt and save' })
  accessToken: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Refresh Token to encrypt and save' })
  refreshToken?: string;

  @IsDateString()
  @IsOptional()
  @ApiPropertyOptional({ description: 'ISO Expiration datetime' })
  expiresAt?: Date;

  @IsArray()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Raw scopes granted' })
  scopes?: string[];
}
