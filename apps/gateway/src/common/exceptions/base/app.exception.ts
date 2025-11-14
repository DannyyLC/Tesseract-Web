import { HttpException, HttpStatus } from "@nestjs/common";
import { ErrorCode } from "./error-codes.enum";


/**
 * Metadata adicional que puede incluir un error
 * Permitte pasar cualquier informacion contextual sobre el error
 * 
 * Ejemplos:
 * - { workflow: 'abc-123' }
 * - { clientId: 'xyz-456', attemptedAction: 'delete' } 
 * - {field: 'email', value: 'invalid@' }
 */

export interface ErrorMetadata {
    [key: string]: any;
}
// Clase base para todas las excepciones de la aplicacion
export class AppException extends HttpException {

    public readonly errorCode: ErrorCode;
    public readonly metadata?: ErrorMetadata;
    public readonly isOperational: boolean;

    constructor(
        errorCode: ErrorCode,
        message: string,
        statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
        metadata?: ErrorMetadata,
        isOperational: boolean = true,
    ) {
        const response = {
        errorCode,
        message,
        statusCode,
        timestamp: new Date().toISOString(),
        metadata,
        };

        super(response, statusCode);
        this.errorCode = errorCode;
        this.metadata = metadata;
        this.isOperational = isOperational;
        Error.captureStackTrace(this, this.constructor);
    }

    /**
     * Método helper para obtener el response formateado
     * Útil para logging o inspección
     */
    public getResponse(): any {
        return super.getResponse();
    }

    /**
     * Método helper para verificar si es un error operacional
     */
    public isOperationalError(): boolean {
        return this.isOperational;
    }
}
