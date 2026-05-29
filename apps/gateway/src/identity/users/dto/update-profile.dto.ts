import { IsString, IsOptional, MinLength, IsUrl } from 'class-validator';
import { UpdateProfileDto as IUpdateProfileDto } from '@tesseract/types';

export class UpdateProfileDto implements IUpdateProfileDto {
  @IsString()
  @IsOptional()
  @MinLength(2, { message: 'Name must be at least 2 characters long' })
  name?: string;

  @IsUrl({}, { message: 'Avatar must be a valid URL' })
  @IsOptional()
  avatar?: string;

  @IsString()
  @IsOptional()
  timezone?: string;
}
