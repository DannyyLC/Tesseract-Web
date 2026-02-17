import { IsNotEmpty, IsString } from "class-validator";

export class ServiceInfoRequestDto {
    @IsString()
    @IsNotEmpty()
    userMsg: string;

    @IsString()
    @IsNotEmpty()
    subject: string;
}