/**
 * Códigos de error estandarizados de la aplicación
 * 
 * Estructura de códigos:
 * - 1000-1999: Errores de autenticación y autorización
 * - 2000-2999: Errores de workflows
 * - 3000-3999: Errores de ejecuciones
 * - 4000-4999: Errores de validación
 * - 5000-5999: Errores de sistema/infraestructura
 * - 6000-6999: Errores de integraciones externas
 * - 7000-7999: Errores de WhatsApp/Baileys
 * - 8000-8999: Errores de rate limiting y quotas
 * - 9000-9999: Errores de tags y categorización
 */
export enum ErrorCode {
  // ============================================
  // 1000-1999: AUTENTICACIÓN Y AUTORIZACIÓN
  // ============================================
  
  /**
   * El API key proporcionado no existe en la base de datos
   * HTTP Status: 401 Unauthorized
   */
  INVALID_API_KEY = 'AUTH_1001',
  
  /**
   * El cliente existe pero su cuenta está inactiva (isActive = false)
   * HTTP Status: 403 Forbidden
   */
  CLIENT_INACTIVE = 'AUTH_1002',
  
  /**
   * El cliente fue eliminado (soft delete, deletedAt != null)
   * HTTP Status: 410 Gone
   */
  CLIENT_DELETED = 'AUTH_1003',
  
  /**
   * Request sin credenciales o no autorizado
   * HTTP Status: 401 Unauthorized
   */
  UNAUTHORIZED = 'AUTH_1004',
  
  /**
   * Token JWT inválido o expirado
   * HTTP Status: 401 Unauthorized
   */
  INVALID_JWT = 'AUTH_1005',
  
  /**
   * Refresh token inválido o expirado
   * HTTP Status: 401 Unauthorized
   */
  INVALID_REFRESH_TOKEN = 'AUTH_1006',
  
  /**
   * Password incorrecto durante login
   * HTTP Status: 401 Unauthorized
   */
  INVALID_PASSWORD = 'AUTH_1007',
  
  /**
   * El cliente no tiene permisos para este recurso
   * HTTP Status: 403 Forbidden
   */
  FORBIDDEN = 'AUTH_1008',
  
  /**
   * El recurso solicitado no pertenece a este cliente
   * HTTP Status: 403 Forbidden
   */
  RESOURCE_NOT_OWNED = 'AUTH_1009',
  
  /**
   * El cliente alcanzó su límite de API keys
   * HTTP Status: 403 Forbidden
   */
  MAX_API_KEYS_EXCEEDED = 'AUTH_1010',

  // ============================================
  // 2000-2999: WORKFLOWS
  // ============================================
  
  /**
   * El workflow solicitado no existe o no pertenece al cliente
   * HTTP Status: 404 Not Found
   */
  WORKFLOW_NOT_FOUND = 'WORKFLOW_2001',
  
  /**
   * Ya existe un workflow con ese nombre para este cliente
   * HTTP Status: 409 Conflict
   */
  WORKFLOW_ALREADY_EXISTS = 'WORKFLOW_2002',
  
  /**
   * La configuración JSON del workflow es inválida
   * HTTP Status: 400 Bad Request
   */
  INVALID_CONFIG = 'WORKFLOW_2003',
  
  /**
   * El cliente alcanzó su límite de workflows según su plan
   * HTTP Status: 403 Forbidden
   */
  MAX_WORKFLOWS_EXCEEDED = 'WORKFLOW_2004',
  
  /**
   * El workflow está pausado y no puede ejecutarse
   * HTTP Status: 409 Conflict
   */
  WORKFLOW_IS_PAUSED = 'WORKFLOW_2005',
  
  /**
   * Los steps del workflow custom son inválidos
   * HTTP Status: 400 Bad Request
   */
  INVALID_CUSTOM_STEPS = 'WORKFLOW_2007',
  
  /**
   * El workflow no puede ser eliminado porque tiene ejecuciones en progreso
   * HTTP Status: 409 Conflict
   */
  WORKFLOW_HAS_ACTIVE_EXECUTIONS = 'WORKFLOW_2008',
  
  /**
   * La cron expression del schedule es inválida
   * HTTP Status: 400 Bad Request
   */
  INVALID_CRON_EXPRESSION = 'WORKFLOW_2009',
  
  /**
   * El timezone especificado no es válido
   * HTTP Status: 400 Bad Request
   */
  INVALID_TIMEZONE = 'WORKFLOW_2010',

  // ============================================
  // 3000-3999: EJECUCIONES
  // ============================================
  
  /**
   * La ejecución solicitada no existe
   * HTTP Status: 404 Not Found
   */
  EXECUTION_NOT_FOUND = 'EXECUTION_3001',
  
  /**
   * La ejecución falló durante su procesamiento
   * HTTP Status: 500 Internal Server Error
   */
  EXECUTION_FAILED = 'EXECUTION_3002',
  
  /**
   * La ejecución excedió el tiempo máximo permitido
   * HTTP Status: 408 Request Timeout
   */
  EXECUTION_TIMEOUT = 'EXECUTION_3003',
  
  /**
   * El cliente alcanzó su límite diario de ejecuciones
   * HTTP Status: 429 Too Many Requests
   */
  MAX_EXECUTIONS_EXCEEDED = 'EXECUTION_3004',
  
  /**
   * El workflow ya tiene una ejecución en progreso
   * HTTP Status: 409 Conflict
   */
  EXECUTION_ALREADY_RUNNING = 'EXECUTION_3005',
  
  /**
   * La ejecución fue cancelada por el usuario
   * HTTP Status: 409 Conflict
   */
  EXECUTION_CANCELLED = 'EXECUTION_3006',
  
  /**
   * Error al ejecutar un step específico del workflow
   * HTTP Status: 500 Internal Server Error
   */
  STEP_EXECUTION_FAILED = 'EXECUTION_3007',
  
  /**
   * Se alcanzó el número máximo de reintentos
   * HTTP Status: 500 Internal Server Error
   */
  MAX_RETRIES_EXCEEDED = 'EXECUTION_3008',

  // ============================================
  // 4000-4999: VALIDACIÓN DE DATOS
  // ============================================
  
  /**
   * Los datos enviados no cumplen con las reglas de validación
   * HTTP Status: 400 Bad Request
   */
  VALIDATION_ERROR = 'VALIDATION_4001',
  
  /**
   * El input proporcionado tiene un formato inválido
   * HTTP Status: 400 Bad Request
   */
  INVALID_INPUT = 'VALIDATION_4002',
  
  /**
   * Falta un campo requerido en el request
   * HTTP Status: 400 Bad Request
   */
  MISSING_REQUIRED_FIELD = 'VALIDATION_4003',
  
  /**
   * El formato del email es inválido
   * HTTP Status: 400 Bad Request
   */
  INVALID_EMAIL_FORMAT = 'VALIDATION_4004',
  
  /**
   * El formato de la URL es inválido
   * HTTP Status: 400 Bad Request
   */
  INVALID_URL_FORMAT = 'VALIDATION_4005',
  
  /**
   * El valor proporcionado está fuera del rango permitido
   * HTTP Status: 400 Bad Request
   */
  VALUE_OUT_OF_RANGE = 'VALIDATION_4006',

  // ============================================
  // 5000-5999: ERRORES DE SISTEMA
  // ============================================
  
  /**
   * Error de conexión o query a la base de datos
   * HTTP Status: 500 Internal Server Error
   */
  DATABASE_ERROR = 'SYSTEM_5001',
  
  /**
   * Error al llamar a una API externa (OpenAI, Anthropic, etc.)
   * HTTP Status: 502 Bad Gateway
   */
  EXTERNAL_API_ERROR = 'SYSTEM_5002',
  
  /**
   * Error interno no categorizado
   * HTTP Status: 500 Internal Server Error
   */
  INTERNAL_ERROR = 'SYSTEM_5003',
  
  /**
   * Servicio temporalmente no disponible
   * HTTP Status: 503 Service Unavailable
   */
  SERVICE_UNAVAILABLE = 'SYSTEM_5004',
  
  /**
   * Error al conectar con el worker
   * HTTP Status: 503 Service Unavailable
   */
  WORKER_UNAVAILABLE = 'SYSTEM_5005',
  
  /**
   * Worker no respondió en el tiempo esperado
   * HTTP Status: 504 Gateway Timeout
   */
  WORKER_TIMEOUT = 'SYSTEM_5006',
  
  /**
   * La cola de mensajes está llena
   * HTTP Status: 503 Service Unavailable
   */
  QUEUE_FULL = 'SYSTEM_5007',
  
  /**
   * Error al procesar mensaje de la cola
   * HTTP Status: 500 Internal Server Error
   */
  QUEUE_PROCESSING_ERROR = 'SYSTEM_5008',

  // ============================================
  // 6000-6999: INTEGRACIONES EXTERNAS
  // ============================================
  
  /**
   * Error al llamar a la API de OpenAI
   * HTTP Status: 502 Bad Gateway
   */
  OPENAI_API_ERROR = 'INTEGRATION_6001',
  
  /**
   * Error al llamar a la API de Anthropic (Claude)
   * HTTP Status: 502 Bad Gateway
   */
  ANTHROPIC_API_ERROR = 'INTEGRATION_6002',
  
  /**
   * La API externa alcanzó su rate limit
   * HTTP Status: 429 Too Many Requests
   */
  EXTERNAL_RATE_LIMIT = 'INTEGRATION_6005',
  
  /**
   * Credenciales inválidas para servicio externo
   * HTTP Status: 502 Bad Gateway
   */
  INVALID_EXTERNAL_CREDENTIALS = 'INTEGRATION_6006',
  
  /**
   * La firma del webhook no es válida
   * HTTP Status: 401 Unauthorized
   */
  INVALID_WEBHOOK_SIGNATURE = 'INTEGRATION_6007',
  
  /**
   * Error al enviar email (SendGrid, Resend, etc.)
   * HTTP Status: 502 Bad Gateway
   */
  EMAIL_SENDING_ERROR = 'INTEGRATION_6008',
  
  /**
   * Error al enviar SMS (Twilio, etc.)
   * HTTP Status: 502 Bad Gateway
   */
  SMS_SENDING_ERROR = 'INTEGRATION_6009',

  // ============================================
  // 7000-7999: WHATSAPP / BAILEYS
  // ============================================
  
  /**
   * La sesión de WhatsApp no está conectada
   * HTTP Status: 503 Service Unavailable
   */
  WHATSAPP_NOT_CONNECTED = 'WHATSAPP_7001',
  
  /**
   * El código QR de WhatsApp expiró
   * HTTP Status: 410 Gone
   */
  WHATSAPP_QR_EXPIRED = 'WHATSAPP_7002',
  
  /**
   * La sesión de Baileys se perdió o cerró
   * HTTP Status: 503 Service Unavailable
   */
  WHATSAPP_SESSION_LOST = 'WHATSAPP_7003',
  
  /**
   * El número de teléfono no es válido
   * HTTP Status: 400 Bad Request
   */
  INVALID_PHONE_NUMBER = 'WHATSAPP_7004',
  
  /**
   * Error al enviar mensaje de WhatsApp
   * HTTP Status: 500 Internal Server Error
   */
  WHATSAPP_SEND_ERROR = 'WHATSAPP_7005',
  
  /**
   * El cliente no tiene configuración de WhatsApp
   * HTTP Status: 404 Not Found
   */
  WHATSAPP_CONFIG_NOT_FOUND = 'WHATSAPP_7006',
  
  /**
   * Error al escanear el código QR
   * HTTP Status: 500 Internal Server Error
   */
  WHATSAPP_QR_SCAN_ERROR = 'WHATSAPP_7007',

  // ============================================
  // 8000-8999: RATE LIMITING Y QUOTAS
  // ============================================
  
  /**
   * Demasiadas peticiones en un período corto de tiempo
   * HTTP Status: 429 Too Many Requests
   */
  TOO_MANY_REQUESTS = 'RATE_8001',
  
  /**
   * Cuota mensual de ejecuciones excedida
   * HTTP Status: 429 Too Many Requests
   */
  MONTHLY_QUOTA_EXCEEDED = 'RATE_8002',
  
  /**
   * Límite de requests por minuto excedido
   * HTTP Status: 429 Too Many Requests
   */
  REQUESTS_PER_MINUTE_EXCEEDED = 'RATE_8003',
  
  /**
   * Límite de costo de API alcanzado
   * HTTP Status: 402 Payment Required
   */
  API_COST_LIMIT_EXCEEDED = 'RATE_8004',
  
  /**
   * Límite de créditos alcanzado
   * HTTP Status: 402 Payment Required
   */
  CREDITS_EXHAUSTED = 'RATE_8005',

  // ============================================
  // 9000-9999: TAGS Y CATEGORIZACIÓN
  // ============================================
  
  /**
   * El tag solicitado no existe
   * HTTP Status: 404 Not Found
   */
  TAG_NOT_FOUND = 'TAG_9001',
  
  /**
   * Ya existe un tag con ese nombre
   * HTTP Status: 409 Conflict
   */
  TAG_ALREADY_EXISTS = 'TAG_9002',
  
  /**
   * Error al asociar tags al workflow
   * HTTP Status: 500 Internal Server Error
   */
  TAG_ASSOCIATION_ERROR = 'TAG_9003',
  
  /**
   * El tag está en uso y no puede ser eliminado
   * HTTP Status: 409 Conflict
   */
  TAG_IN_USE = 'TAG_9004',

  // ============================================
  // 10000-10999: CLIENTS / CUENTAS
  // ============================================
  
  /**
   * El cliente solicitado no existe
   * HTTP Status: 404 Not Found
   */
  CLIENT_NOT_FOUND = 'CLIENT_10001',
  
  /**
   * Ya existe un cliente con ese email
   * HTTP Status: 409 Conflict
   */
  EMAIL_ALREADY_REGISTERED = 'CLIENT_10002',
  
  /**
   * Error al crear la cuenta del cliente
   * HTTP Status: 500 Internal Server Error
   */
  CLIENT_CREATION_ERROR = 'CLIENT_10003',
  
  /**
   * Error al actualizar los datos del cliente
   * HTTP Status: 500 Internal Server Error
   */
  CLIENT_UPDATE_ERROR = 'CLIENT_10004',
}
