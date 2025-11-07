import { IsString, IsOptional, MaxLength, IsNotEmpty, IsArray, IsDateString } from "class-validator";

export class CreateApiKeyDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    scopes?: string[];

    @IsOptional()
    @IsDateString()
    expiresAt?: string;

}
