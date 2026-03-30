import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { DeleteOrganizationDto as IDeleteOrganizationDto } from '@tesseract/types';

export class DeleteOrganizationDto implements IDeleteOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  confirmationText: string;

  @IsOptional()
  @IsString()
  code2FA?: string;
}
