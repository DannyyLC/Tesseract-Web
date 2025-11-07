import { IsString, IsOptional, IsBoolean, MaxLength } from "class-validator";

export class UpdateApiKeyDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    name?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}