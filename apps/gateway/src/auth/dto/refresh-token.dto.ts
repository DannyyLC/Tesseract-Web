import { IsString, IsNotEmpty } from 'class-validator';

/**
 * DTO para refrescar el access token usando un refresh token
 */
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
