import { HttpStatus } from "@nestjs/common";
import { AppException } from "../base/app.exception";
import { ErrorCode } from "../base/error-codes.enum";

/**
 * Exception: Cliente no encontrado
 * Se lanza cuando el cliente solicitado no existe
 */
export class ClientNotFoundException extends AppException {
    constructor(clientId: string) {
        super(
            ErrorCode.CLIENT_NOT_FOUND,
            `Client with ID "${clientId}" not found`,
            HttpStatus.NOT_FOUND,
            { clientId}
        )
    }
}

/**
 * Excepción: Email ya registrado
 * Se lanza cuando intentan crear un cliente con un email que ya existe
 */
export class EmailAlreadyRegisteredException extends AppException {
    constructor(email: string){
        super(
            ErrorCode.EMAIL_ALREADY_REGISTERED,
            `An account with that email "${email}" already exists`,
            HttpStatus.CONFLICT,
            { email }
        )
    }
}

/**
 * Excepción: Error al crear cliente
 * Se lanza cuando hay un error durante la creación del cliente
 */
export class ClientCreationErrorException extends AppException {
    constructor(reason: string) {
        super(
            ErrorCode.CLIENT_CREATION_ERROR,
            `Faildes to create client: ${reason}`,
            HttpStatus.INTERNAL_SERVER_ERROR,
            { reason },
            false
        )
    }
}

/**
 * Excepción: Error al actualizar cliente
 * Se lanza cuando hay un error durante la actualización del cliente
 */
export class ClientUpdateErrorException extends AppException {
    constructor(clientId: string, reason: string) {
        super(
            ErrorCode.CLIENT_UPDATE_ERROR,
            `Failed to update client: ${reason}`,
            HttpStatus.INTERNAL_SERVER_ERROR,
            { clientId, reason },
            false,
        )
    }
}
