import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppException } from '../base/app.exception';
import { ErrorCode } from '../base/error-codes.enum';

/**
 * Interfaz para la respuesta de error estandarizada
 * Todas las respuestas de error tendrán esta estructura
 */
interface ErrorResponse {
  success: false;
  errorCode: string;
  message: string;
  statusCode: number;
  timestamp: string;
  path: string;
  metadata?: any;
  stack?: string; // Solo en desarrollo
}

/**
 * Filtro global de excepciones
 * 
 * Captura TODAS las excepciones lanzadas en la aplicación y las convierte
 * en respuestas HTTP estandarizadas.
 * 
 * Responsabilidades:
 * 1. Formatear errores de manera consistente
 * 2. Loguear errores con el nivel apropiado
 * 3. Ocultar información sensible en producción
 * 4. Manejar errores de Prisma específicamente
 * 5. Enviar respuestas HTTP apropiadas
 * 
 * @example
 * // En main.ts:
 * app.useGlobalFilters(new GlobalExceptionFilter());
 */
@Catch() // Sin parámetros = captura TODO tipo de error
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionHandler');

  /**
   * Método principal que captura todas las excepciones
   * 
   * @param exception - El error que ocurrió (puede ser de cualquier tipo)
   * @param host - Contexto de ejecución (contiene request, response, etc.)
   */
  catch(exception: unknown, host: ArgumentsHost) {
    // Obtener el contexto HTTP (request y response)
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Construir la respuesta de error
    const errorResponse = this.buildErrorResponse(exception, request);

    // Loguear el error con el nivel apropiado
    this.logError(exception, errorResponse, request);

    // Enviar respuesta HTTP al cliente
    response.status(errorResponse.statusCode).json(errorResponse);
  }

  /**
   * Construye la respuesta de error según el tipo de excepción
   * 
   * Maneja 4 casos:
   * 1. AppException (nuestras excepciones custom)
   * 2. HttpException (excepciones de NestJS)
   * 3. Errores de Prisma
   * 4. Errores desconocidos
   */
  private buildErrorResponse(
    exception: unknown,
    request: Request,
  ): ErrorResponse {
    const timestamp = new Date().toISOString();
    const path = request.url;
    const isProduction = process.env.NODE_ENV === 'production';

    // ============================================
    // Excepciones custom (AppException)
    // ============================================
    if (exception instanceof AppException) {
      return {
        success: false,
        errorCode: exception.errorCode,
        message: exception.message,
        statusCode: exception.getStatus(),
        timestamp,
        path,
        metadata: exception.metadata,
        // En desarrollo mostramos el stack trace, en producción NO
        stack: !isProduction ? exception.stack : undefined,
      };
    }

    // ============================================
    // Excepciones HTTP de NestJS (HttpException)
    // ============================================
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      let message = 'An error occurred';
      let errorCode = 'HTTP_ERROR';

      // El response puede ser string u objeto
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        message = (exceptionResponse as any).message || message;
        errorCode = (exceptionResponse as any).errorCode || errorCode;
      }

      return {
        success: false,
        errorCode,
        message,
        statusCode: status,
        timestamp,
        path,
        stack: !isProduction ? exception.stack : undefined,
      };
    }

    // ============================================
    // Errores de Prisma
    // ============================================
    if (this.isPrismaError(exception)) {
      return this.handlePrismaError(
        exception as any,
        timestamp,
        path,
        isProduction,
      );
    }

    // ============================================
    // Errores desconocidos (bugs, errores de sistema)
    // ============================================
    this.logger.error('Unexpected error:', exception);

    return {
      success: false,
      errorCode: ErrorCode.INTERNAL_ERROR,
      message: isProduction
        ? 'An internal server error occurred'
        : (exception as Error).message || 'Unknown error',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      timestamp,
      path,
      stack: !isProduction ? (exception as Error).stack : undefined,
    };
  }

  /**
   * Maneja errores específicos de Prisma
   * 
   * Prisma lanza errores con códigos como P2002, P2025, etc.
   * Los convertimos a errores más amigables para el usuario
   * 
   * Ver todos los códigos: https://www.prisma.io/docs/reference/api-reference/error-reference
   */
  private handlePrismaError(
    exception: any,
    timestamp: string,
    path: string,
    isProduction: boolean,
  ): ErrorResponse {
    const code = exception.code;

    // P2002: Unique constraint violation (ej: email ya existe)
    if (code === 'P2002') {
      const field = exception.meta?.target?.[0] || 'field';
      return {
        success: false,
        errorCode: 'DATABASE_UNIQUE_VIOLATION',
        message: `A record with this ${field} already exists`,
        statusCode: HttpStatus.CONFLICT,
        timestamp,
        path,
        metadata: { field, constraintCode: code },
      };
    }

    // P2025: Record not found (ej: findUniqueOrThrow no encontró el registro)
    if (code === 'P2025') {
      return {
        success: false,
        errorCode: 'DATABASE_NOT_FOUND',
        message: 'The requested record was not found',
        statusCode: HttpStatus.NOT_FOUND,
        timestamp,
        path,
      };
    }

    // P2003: Foreign key constraint violation
    if (code === 'P2003') {
      const field = exception.meta?.field_name || 'field';
      return {
        success: false,
        errorCode: 'DATABASE_FOREIGN_KEY_VIOLATION',
        message: `Invalid reference: ${field}`,
        statusCode: HttpStatus.BAD_REQUEST,
        timestamp,
        path,
        metadata: { field, constraintCode: code },
      };
    }

    // P2014: Invalid relation (ej: intentas conectar registros que no tienen relación)
    if (code === 'P2014') {
      return {
        success: false,
        errorCode: 'DATABASE_INVALID_RELATION',
        message: 'The relation between records is invalid',
        statusCode: HttpStatus.BAD_REQUEST,
        timestamp,
        path,
      };
    }

    // Otros errores de Prisma (error genérico de DB)
    return {
      success: false,
      errorCode: ErrorCode.DATABASE_ERROR,
      message: isProduction
        ? 'A database error occurred'
        : exception.message,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      timestamp,
      path,
      metadata: !isProduction ? { prismaCode: code } : undefined,
    };
  }

  /**
   * Verifica si un error es de Prisma
   * 
   * Los errores de Prisma tienen una propiedad 'code' que empieza con 'P'
   */
  private isPrismaError(exception: unknown): boolean {
    return (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      typeof (exception as any).code === 'string' &&
      (exception as any).code.startsWith('P')
    );
  }

  /**
   * Loguea el error con el nivel apropiado según su gravedad
   * 
   * Niveles de logging:
   * - WARN: Errores operacionales (esperados) y errores 4xx
   * - ERROR: Errores 5xx (bugs del servidor)
   * 
   * En producción, los errores 5xx también se enviarían a Sentry/Datadog
   */
  private logError(
    exception: unknown,
    errorResponse: ErrorResponse,
    request: Request,
  ) {
    const { method, url, ip, headers } = request;
    const userAgent = headers['user-agent'] || 'unknown';
    
    // Obtener el clientId si existe en el request (agregado por AuthGuard)
    const clientId = (request as any).client?.id || 'anonymous';

    // Contexto del error para logging
    const logContext = {
      method,
      url,
      ip,
      userAgent,
      clientId,
      errorCode: errorResponse.errorCode,
      statusCode: errorResponse.statusCode,
    };

    // ============================================
    // Errores operacionales (esperados)
    // ============================================
    if (exception instanceof AppException && exception.isOperational) {
      this.logger.warn(
        `Operational error: ${errorResponse.message}`,
        JSON.stringify(logContext),
      );
      return;
    }

    // ============================================
    // Errores 4xx (error del cliente)
    // ============================================
    if (errorResponse.statusCode >= 400 && errorResponse.statusCode < 500) {
      this.logger.warn(
        `Client error: ${errorResponse.message}`,
        JSON.stringify(logContext),
      );
      return;
    }

    // ============================================
    // Errores 5xx (bugs/problemas del servidor)
    // ============================================
    this.logger.error(
      `Server error: ${errorResponse.message}`,
      (exception as Error).stack,
      JSON.stringify(logContext),
    );

    // TODO: En producción, enviar a sistema de monitoreo
    // if (process.env.NODE_ENV === 'production') {
    //   Sentry.captureException(exception, {
    //     extra: logContext,
    //     user: { id: clientId },
    //     tags: {
    //       errorCode: errorResponse.errorCode,
    //       statusCode: errorResponse.statusCode,
    //     },
    //   });
    // }
  }
}