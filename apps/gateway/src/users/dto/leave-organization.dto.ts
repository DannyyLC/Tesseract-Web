import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LeaveOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  confirmationText: string;

  @IsOptional()
  @IsString()
  code2FA?: string;
}
