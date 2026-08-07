import { IsNotEmpty, IsString } from 'class-validator';

export class UpdatePageAccessTokenDto {
  @IsNotEmpty()
  @IsString()
  pageAccessToken: string;
}
