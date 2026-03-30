import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { LeaveOrganizationDto as ILeaveOrganizationDto } from '@tesseract/types';

export class LeaveOrganizationDto implements ILeaveOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  confirmationText: string;

  @IsOptional()
  @IsString()
  code2FA?: string;
}
