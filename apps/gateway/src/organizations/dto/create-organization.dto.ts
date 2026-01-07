import { IsString, IsEmail, MinLength, MaxLength, IsNotEmpty } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  // Datos del owner
  @IsEmail()
  @IsNotEmpty()
  ownerEmail: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  ownerName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  ownerPassword: string;
}
