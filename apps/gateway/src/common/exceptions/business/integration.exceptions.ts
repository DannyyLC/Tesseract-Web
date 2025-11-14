import { HttpStatus } from '@nestjs/common';
import { AppException } from '../base/app.exception';
import { ErrorCode } from '../base/error-codes.enum';

/**
 * Excepción: Error de OpenAI API
 * Se lanza cuando la API de OpenAI falla o devuelve error
 */
export class OpenAiApiErrorException extends AppException {
  constructor(reason: string, statusCode?: number) {
    super(
      ErrorCode.OPENAI_API_ERROR,
      `OpenAI API error: ${reason}`,
      HttpStatus.BAD_GATEWAY,
      { reason, externalStatusCode: statusCode },
    );
  }
}

/**
 * Excepción: Error de Anthropic API
 * Se lanza cuando la API de Anthropic (Claude) falla o devuelve error
 */
export class AnthropicApiErrorException extends AppException {
  constructor(reason: string, statusCode?: number) {
    super(
      ErrorCode.ANTHROPIC_API_ERROR,
      `Anthropic API error: ${reason}`,
      HttpStatus.BAD_GATEWAY,
      { reason, externalStatusCode: statusCode },
    );
  }
}

/**
 * Excepción: Error de webhook n8n
 * Se lanza cuando el webhook de n8n falla o devuelve error
 */
export class N8nWebhookErrorException extends AppException {
  constructor(webhookUrl: string, reason: string, statusCode?: number) {
    super(
      ErrorCode.N8N_WEBHOOK_ERROR,
      `n8n webhook error: ${reason}`,
      HttpStatus.BAD_GATEWAY,
      { webhookUrl, reason, externalStatusCode: statusCode },
    );
  }
}

/**
 * Excepción: Timeout de webhook n8n
 * Se lanza cuando el webhook de n8n no responde a tiempo
 */
export class N8nWebhookTimeoutException extends AppException {
  constructor(webhookUrl: string, timeoutSeconds: number) {
    super(
      ErrorCode.N8N_WEBHOOK_TIMEOUT,
      `n8n webhook timed out after ${timeoutSeconds} seconds`,
      HttpStatus.GATEWAY_TIMEOUT,
      { webhookUrl, timeoutSeconds },
    );
  }
}

/**
 * Excepción: Rate limit de API externa
 * Se lanza cuando una API externa alcanza su rate limit
 */
export class ExternalRateLimitException extends AppException {
  constructor(service: string, retryAfterSeconds?: number) {
    super(
      ErrorCode.EXTERNAL_RATE_LIMIT,
      retryAfterSeconds
        ? `${service} rate limit exceeded. Retry after ${retryAfterSeconds} seconds.`
        : `${service} rate limit exceeded`,
      HttpStatus.TOO_MANY_REQUESTS,
      { service, retryAfterSeconds },
    );
  }
}

/**
 * Excepción: Credenciales inválidas para servicio externo
 * Se lanza cuando las credenciales de un servicio externo son inválidas
 */
export class InvalidExternalCredentialsException extends AppException {
  constructor(service: string, reason?: string) {
    super(
      ErrorCode.INVALID_EXTERNAL_CREDENTIALS,
      reason
        ? `Invalid credentials for ${service}: ${reason}`
        : `Invalid credentials for ${service}`,
      HttpStatus.BAD_GATEWAY,
      { service, reason },
    );
  }
}

/**
 * Excepción: Firma de webhook inválida
 * Se lanza cuando la firma de un webhook entrante no es válida
 */
export class InvalidWebhookSignatureException extends AppException {
  constructor(expectedSignature?: string, receivedSignature?: string) {
    super(
      ErrorCode.INVALID_WEBHOOK_SIGNATURE,
      'Invalid webhook signature. Request could not be verified.',
      HttpStatus.UNAUTHORIZED,
      { expectedSignature, receivedSignature },
    );
  }
}

/**
 * Excepción: Error al enviar email
 * Se lanza cuando falla el envío de email (SendGrid, Resend, etc.)
 */
export class EmailSendingErrorException extends AppException {
  constructor(recipient: string, reason: string, provider?: string) {
    super(
      ErrorCode.EMAIL_SENDING_ERROR,
      `Failed to send email to ${recipient}: ${reason}`,
      HttpStatus.BAD_GATEWAY,
      { recipient, reason, provider },
    );
  }
}

/**
 * Excepción: Error al enviar SMS
 * Se lanza cuando falla el envío de SMS (Twilio, etc.)
 */
export class SmsSendingErrorException extends AppException {
  constructor(phoneNumber: string, reason: string, provider?: string) {
    super(
      ErrorCode.SMS_SENDING_ERROR,
      `Failed to send SMS to ${phoneNumber}: ${reason}`,
      HttpStatus.BAD_GATEWAY,
      { phoneNumber, reason, provider },
    );
  }
}

/**
 * Excepción: Error genérico de API externa
 * Se lanza cuando una API externa falla y no hay una excepción más específica
 */
export class ExternalApiErrorException extends AppException {
  constructor(service: string, reason: string, statusCode?: number) {
    super(
      ErrorCode.EXTERNAL_API_ERROR,
      `External API error (${service}): ${reason}`,
      HttpStatus.BAD_GATEWAY,
      { service, reason, externalStatusCode: statusCode },
    );
  }
}

/**
 * Excepción: WhatsApp no conectado
 * Se lanza cuando intentan enviar mensaje pero WhatsApp no está conectado
 */
export class WhatsAppNotConnectedException extends AppException {
  constructor(clientId: string) {
    super(
      ErrorCode.WHATSAPP_NOT_CONNECTED,
      'WhatsApp is not connected. Please scan the QR code to connect.',
      HttpStatus.SERVICE_UNAVAILABLE,
      { clientId },
    );
  }
}

/**
 * Excepción: QR de WhatsApp expirado
 * Se lanza cuando el código QR de WhatsApp expira
 */
export class WhatsAppQrExpiredException extends AppException {
  constructor() {
    super(
      ErrorCode.WHATSAPP_QR_EXPIRED,
      'WhatsApp QR code has expired. Please generate a new one.',
      HttpStatus.GONE,
    );
  }
}

/**
 * Excepción: Sesión de WhatsApp perdida
 * Se lanza cuando la sesión de Baileys se pierde o cierra
 */
export class WhatsAppSessionLostException extends AppException {
  constructor(reason?: string) {
    super(
      ErrorCode.WHATSAPP_SESSION_LOST,
      reason
        ? `WhatsApp session lost: ${reason}`
        : 'WhatsApp session was disconnected. Please reconnect.',
      HttpStatus.SERVICE_UNAVAILABLE,
      { reason },
    );
  }
}

/**
 * Excepción: Número de teléfono inválido
 * Se lanza cuando el formato del número de teléfono es inválido
 */
export class InvalidPhoneNumberException extends AppException {
  constructor(phoneNumber: string) {
    super(
      ErrorCode.INVALID_PHONE_NUMBER,
      `Invalid phone number format: "${phoneNumber}"`,
      HttpStatus.BAD_REQUEST,
      { phoneNumber },
    );
  }
}

/**
 * Excepción: Error al enviar mensaje de WhatsApp
 * Se lanza cuando falla el envío de un mensaje por WhatsApp
 */
export class WhatsAppSendErrorException extends AppException {
  constructor(phoneNumber: string, reason: string) {
    super(
      ErrorCode.WHATSAPP_SEND_ERROR,
      `Failed to send WhatsApp message to ${phoneNumber}: ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
      { phoneNumber, reason },
      false, // Bug potencial
    );
  }
}

/**
 * Excepción: Configuración de WhatsApp no encontrada
 * Se lanza cuando el cliente no tiene configuración de WhatsApp
 */
export class WhatsAppConfigNotFoundException extends AppException {
  constructor(clientId: string) {
    super(
      ErrorCode.WHATSAPP_CONFIG_NOT_FOUND,
      'WhatsApp configuration not found. Please set up WhatsApp first.',
      HttpStatus.NOT_FOUND,
      { clientId },
    );
  }
}

/**
 * Excepción: Error al escanear QR de WhatsApp
 * Se lanza cuando hay un error durante el proceso de escaneo del QR
 */
export class WhatsAppQrScanErrorException extends AppException {
  constructor(reason: string) {
    super(
      ErrorCode.WHATSAPP_QR_SCAN_ERROR,
      `Failed to generate WhatsApp QR code: ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
      { reason },
      false,
    );
  }
}