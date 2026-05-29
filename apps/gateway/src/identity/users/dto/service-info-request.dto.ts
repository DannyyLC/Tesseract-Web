import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class ServiceInfoRequestDto {
  @IsString()
  @IsOptional()
  userMsg?: string;

  @IsString()
  @IsNotEmpty()
  subject: string;
}
