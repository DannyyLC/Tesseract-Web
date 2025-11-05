import { HttpStatus } from '@nestjs/common';
import { AppException } from '../base/app.exception';
import { ErrorCode } from '../base/error-codes.enum';

/**
 * Excepción: Error de validación genérico
 * Se lanza cuando los datos no cumplen las reglas de validación
 */
export class ValidationErrorException extends AppException {
  constructor(errors: any[]) {
    super(
      ErrorCode.VALIDATION_ERROR,
      'Validation failed',
      HttpStatus.BAD_REQUEST,
      { errors },
    );
  }
}

/**
 * Excepción: Input inválido
 * Se lanza cuando el formato del input es incorrecto
 */
export class InvalidInputException extends AppException {
  constructor(field: string, value: any, reason?: string) {
    super(
      ErrorCode.INVALID_INPUT,
      reason
        ? `Invalid input for field "${field}": ${reason}`
        : `Invalid input for field "${field}"`,
      HttpStatus.BAD_REQUEST,
      { field, value, reason },
    );
  }
}

/**
 * Excepción: Campo requerido faltante
 */
export class MissingRequiredFieldException extends AppException {
  constructor(field: string) {
    super(
      ErrorCode.MISSING_REQUIRED_FIELD,
      `Required field "${field}" is missing`,
      HttpStatus.BAD_REQUEST,
      { field },
    );
  }
}

/**
 * Excepción: Formato de email inválido
 */
export class InvalidEmailFormatException extends AppException {
  constructor(email: string) {
    super(
      ErrorCode.INVALID_EMAIL_FORMAT,
      `Invalid email format: "${email}"`,
      HttpStatus.BAD_REQUEST,
      { email },
    );
  }
}

/**
 * Excepción: Formato de URL inválido
 */
export class InvalidUrlFormatException extends AppException {
  constructor(url: string) {
    super(
      ErrorCode.INVALID_URL_FORMAT,
      `Invalid URL format: "${url}"`,
      HttpStatus.BAD_REQUEST,
      { url },
    );
  }
}

/**
 * Excepción: Valor fuera de rango
 */
export class ValueOutOfRangeException extends AppException {
  constructor(field: string, value: any, min: number, max: number) {
    super(
      ErrorCode.VALUE_OUT_OF_RANGE,
      `Value for "${field}" (${value}) is out of range. Expected between ${min} and ${max}`,
      HttpStatus.BAD_REQUEST,
      { field, value, min, max },
    );
  }
}