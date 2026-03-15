import { IsNotEmpty, IsString } from "class-validator";

export class SetupCredentialDto {
    @IsNotEmpty()
    @IsString()
    configId: string;
    @IsNotEmpty()
    @IsString()
    credentialPath: string;
}