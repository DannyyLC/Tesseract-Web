import { HttpStatus } from '@nestjs/common';
import { AppException } from '../base/app.exception';
import { ErrorCode } from '../base/error-codes.enum';

/**
 * Excepción: Ejecución no encontrada
 * Se lanza cuando la ejecución no existe
 */
export class ExecutionNotFoundException extends AppException {
  constructor(executionId: string) {
    super(
      ErrorCode.EXECUTION_NOT_FOUND,
      `Execution with ID "${executionId}" not found`,
      HttpStatus.NOT_FOUND,
      { executionId },
    );
  }
}

/**
 * Excepción: Ejecución falló
 * Se lanza cuando una ejecución falla durante su procesamiento
 */
export class ExecutionFailedException extends AppException {
  constructor(executionId: string, reason: string) {
    super(
      ErrorCode.EXECUTION_FAILED,
      `Execution "${executionId}" failed: ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
      { executionId, reason },
      false, // ← isOperational = false (es un bug potencial)
    );
  }
}

/**
 * Excepción: Ejecución timeout
 * Se lanza cuando una ejecución excede el tiempo máximo
 */
export class ExecutionTimeoutException extends AppException {
  constructor(executionId: string, timeoutSeconds: number) {
    super(
      ErrorCode.EXECUTION_TIMEOUT,
      `Execution "${executionId}" timed out after ${timeoutSeconds} seconds`,
      HttpStatus.REQUEST_TIMEOUT,
      { executionId, timeoutSeconds },
    );
  }
}

/**
 * Excepción: Límite de ejecuciones excedido
 * Se lanza cuando el cliente alcanza su maxExecutionsPerDay
 */
export class MaxExecutionsExceededException extends AppException {
  constructor(currentCount: number, maxAllowed: number) {
    super(
      ErrorCode.MAX_EXECUTIONS_EXCEEDED,
      `Daily execution limit exceeded (${currentCount}/${maxAllowed}). Please upgrade your plan or wait until tomorrow.`,
      HttpStatus.TOO_MANY_REQUESTS,
      { currentCount, maxAllowed },
    );
  }
}

/**
 * Excepción: Ejecución ya en progreso
 * Se lanza cuando intentan ejecutar un workflow que ya está corriendo
 */
export class ExecutionAlreadyRunningException extends AppException {
  constructor(workflowId: string, runningExecutionId: string) {
    super(
      ErrorCode.EXECUTION_ALREADY_RUNNING,
      `Workflow "${workflowId}" already has an execution in progress (${runningExecutionId})`,
      HttpStatus.CONFLICT,
      { workflowId, runningExecutionId },
    );
  }
}

/**
 * Excepción: Ejecución cancelada
 * Se lanza cuando una ejecución es cancelada por el usuario
 */
export class ExecutionCancelledException extends AppException {
  constructor(executionId: string) {
    super(
      ErrorCode.EXECUTION_CANCELLED,
      `Execution "${executionId}" was cancelled`,
      HttpStatus.CONFLICT,
      { executionId },
    );
  }
}

/**
 * Excepción: Fallo al ejecutar un step
 * Se lanza cuando un step específico del workflow falla
 */
export class StepExecutionFailedException extends AppException {
  constructor(stepId: string, stepType: string, reason: string) {
    super(
      ErrorCode.STEP_EXECUTION_FAILED,
      `Step "${stepId}" (${stepType}) failed: ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
      { stepId, stepType, reason },
      false, // ← Bug potencial
    );
  }
}

/**
 * Excepción: Máximo de reintentos excedido
 * Se lanza cuando se alcanza maxRetries sin éxito
 */
export class MaxRetriesExceededException extends AppException {
  constructor(executionId: string, retryCount: number, maxRetries: number) {
    super(
      ErrorCode.MAX_RETRIES_EXCEEDED,
      `Execution "${executionId}" failed after ${retryCount} retries (max: ${maxRetries})`,
      HttpStatus.INTERNAL_SERVER_ERROR,
      { executionId, retryCount, maxRetries },
    );
  }
}
