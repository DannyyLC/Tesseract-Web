import { HttpStatus } from '@nestjs/common';
import { AppException } from '../base/app.exception';
import { ErrorCode } from '../base/error-codes.enum';

/**
 * Excepción: Error de base de datos
 */
export class DatabaseErrorException extends AppException {
  constructor(reason?: string) {
    super(
      ErrorCode.DATABASE_ERROR,
      reason ? `Database error: ${reason}` : 'A database error occurred',
      HttpStatus.INTERNAL_SERVER_ERROR,
      { reason },
      false, // Bug, no operacional
    );
  }
}

/**
 * Excepción: Error interno
 */
export class InternalErrorException extends AppException {
  constructor(reason?: string) {
    super(
      ErrorCode.INTERNAL_ERROR,
      reason ? `Internal error: ${reason}` : 'An internal error occurred',
      HttpStatus.INTERNAL_SERVER_ERROR,
      { reason },
      false, // Bug
    );
  }
}

/**
 * Excepción: Servicio no disponible
 */
export class ServiceUnavailableException extends AppException {
  constructor(service?: string) {
    super(
      ErrorCode.SERVICE_UNAVAILABLE,
      service
        ? `Service "${service}" is temporarily unavailable`
        : 'Service temporarily unavailable',
      HttpStatus.SERVICE_UNAVAILABLE,
      { service },
    );
  }
}

/**
 * Excepción: Worker no disponible
 */
export class WorkerUnavailableException extends AppException {
  constructor(workerType: string) {
    super(
      ErrorCode.WORKER_UNAVAILABLE,
      `Worker "${workerType}" is not available`,
      HttpStatus.SERVICE_UNAVAILABLE,
      { workerType },
    );
  }
}

/**
 * Excepción: Worker timeout
 */
export class WorkerTimeoutException extends AppException {
  constructor(workerType: string, timeoutSeconds: number) {
    super(
      ErrorCode.WORKER_TIMEOUT,
      `Worker "${workerType}" timed out after ${timeoutSeconds} seconds`,
      HttpStatus.GATEWAY_TIMEOUT,
      { workerType, timeoutSeconds },
    );
  }
}

/**
 * Excepción: Cola llena
 */
export class QueueFullException extends AppException {
  constructor(queueName: string) {
    super(ErrorCode.QUEUE_FULL, `Queue "${queueName}" is full`, HttpStatus.SERVICE_UNAVAILABLE, {
      queueName,
    });
  }
}

/**
 * Excepción: Error procesando cola
 */
export class QueueProcessingErrorException extends AppException {
  constructor(queueName: string, reason: string) {
    super(
      ErrorCode.QUEUE_PROCESSING_ERROR,
      `Failed to process message in queue "${queueName}": ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
      { queueName, reason },
      false, // Bug
    );
  }
}
