import { IsNotEmpty, IsString } from "class-validator";

export class CreateConfigDto {
    @IsNotEmpty()
    @IsString()
    workflowId: string;
    @IsNotEmpty()
    @IsString()
    phoneNumber: string;
}