import { HttpStatus } from '@nestjs/common';
import { AppException } from '../base/app.exception';
import { ErrorCode } from '../base/error-codes.enum';

/**
 * Excepción: Demasiadas peticiones
 */
export class TooManyRequestsException extends AppException {
  constructor(retryAfterSeconds?: number) {
    super(
      ErrorCode.TOO_MANY_REQUESTS,
      retryAfterSeconds
        ? `Too many requests. Please try again in ${retryAfterSeconds} seconds`
        : 'Too many requests. Please slow down',
      HttpStatus.TOO_MANY_REQUESTS,
      { retryAfterSeconds },
    );
  }
}

/**
 * Excepción: Cuota mensual excedida
 */
export class MonthlyQuotaExceededException extends AppException {
  constructor(used: number, limit: number) {
    super(
      ErrorCode.MONTHLY_QUOTA_EXCEEDED,
      `Monthly quota exceeded (${used}/${limit})`,
      HttpStatus.TOO_MANY_REQUESTS,
      { used, limit },
    );
  }
}

/**
 * Excepción: Requests por minuto excedidos
 */
export class RequestsPerMinuteExceededException extends AppException {
  constructor(limit: number) {
    super(
      ErrorCode.REQUESTS_PER_MINUTE_EXCEEDED,
      `Rate limit exceeded: maximum ${limit} requests per minute`,
      HttpStatus.TOO_MANY_REQUESTS,
      { limit },
    );
  }
}

/**
 * Excepción: Límite de costo de API excedido
 */
export class ApiCostLimitExceededException extends AppException {
  constructor(currentCost: number, limit: number) {
    super(
      ErrorCode.API_COST_LIMIT_EXCEEDED,
      `API cost limit exceeded ($${currentCost}/$${limit})`,
      HttpStatus.PAYMENT_REQUIRED,
      { currentCost, limit },
    );
  }
}

/**
 * Excepción: Créditos agotados
 */
export class CreditsExhaustedException extends AppException {
  constructor() {
    super(
      ErrorCode.CREDITS_EXHAUSTED,
      'You have run out of credits. Please purchase more to continue',
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
