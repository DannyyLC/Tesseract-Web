import { HttpStatus } from '@nestjs/common';
import { AppException } from '../base/app.exception';
import { ErrorCode } from '../base/error-codes.enum';

/**
 * Excepción: API Key inválido
 * Se lanza cuando el header x-api-key no existe en la base de datos
 */
export class InvalidApiKeyException extends AppException {
  constructor() {
    super(
      ErrorCode.INVALID_API_KEY,
      'Invalid API key provided',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

/**
 * Excepción: Cliente inactivo
 * Se lanza cuando el cliente existe pero isActive = false
 */
export class ClientInactiveException extends AppException {
  constructor(clientId: string) {
    super(
      ErrorCode.CLIENT_INACTIVE,
      'Your account is currently inactive. Please contact support.',
      HttpStatus.FORBIDDEN,
      { clientId },
    );
  }
}

/**
 * Excepción: Cliente eliminado
 * Se lanza cuando el cliente tiene deletedAt != null
 */
export class ClientDeletedException extends AppException {
  constructor(clientId: string) {
    super(
      ErrorCode.CLIENT_DELETED,
      'This account has been deleted',
      HttpStatus.GONE,
      { clientId },
    );
  }
}

/**
 * Excepción: Sin autorización
 * Se lanza cuando falta el header x-api-key completamente
 */
export class UnauthorizedException extends AppException {
  constructor() {
    super(
      ErrorCode.UNAUTHORIZED,
      'No authentication credentials provided',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

/**
 * Excepción: JWT inválido
 * Se lanza cuando el token JWT es inválido o expiró
 */
export class InvalidJwtException extends AppException {
  constructor(reason?: string) {
    super(
      ErrorCode.INVALID_JWT,
      reason ? `Invalid JWT token: ${reason}` : 'Invalid or expired JWT token',
      HttpStatus.UNAUTHORIZED,
      { reason },
    );
  }
}

/**
 * Excepción: Refresh token inválido
 * Se lanza cuando el refresh token no es válido
 */
export class InvalidRefreshTokenException extends AppException {
  constructor() {
    super(
      ErrorCode.INVALID_REFRESH_TOKEN,
      'Invalid or expired refresh token',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

/**
 * Excepción: Password incorrecto
 * Se lanza durante el login cuando el password no coincide
 */
export class InvalidPasswordException extends AppException {
  constructor() {
    super(
      ErrorCode.INVALID_PASSWORD,
      'Invalid email or password',
      HttpStatus.UNAUTHORIZED,
    );
  }
}

/**
 * Excepción: Sin permisos
 * Se lanza cuando el cliente no tiene permisos para una acción
 */
export class ForbiddenException extends AppException {
  constructor(action?: string) {
    super(
      ErrorCode.FORBIDDEN,
      action
        ? `You don't have permission to ${action}`
        : "You don't have permission to perform this action",
      HttpStatus.FORBIDDEN,
      { action },
    );
  }
}

/**
 * Excepción: Recurso no pertenece al cliente
 * Se lanza cuando intentan acceder a un recurso que no es suyo
 */
export class ResourceNotOwnedException extends AppException {
  constructor(resourceType: string, resourceId: string) {
    super(
      ErrorCode.RESOURCE_NOT_OWNED,
      `This ${resourceType} does not belong to your account`,
      HttpStatus.FORBIDDEN,
      { resourceType, resourceId },
    );
  }
}

/**
 * Excepción: Límite de API keys excedido
 * Se lanza cuando el cliente intenta crear más API keys del límite permitido
 */
export class MaxApiKeysExceededException extends AppException {
  constructor(currentCount: number, maxAllowed: number) {
    super(
      ErrorCode.MAX_API_KEYS_EXCEEDED,
      `You have reached the maximum number of API keys (${currentCount}/${maxAllowed})`,
      HttpStatus.FORBIDDEN,
      { currentCount, maxAllowed },
    );
  }
}