import { HttpStatus } from '@nestjs/common';
import { AppException } from '../base/app.exception';
import { ErrorCode } from '../base/error-codes.enum';

/**
 * Excepción: Workflow no encontrado
 * Se lanza cuando el workflow no existe o no pertenece al cliente
 */
export class WorkflowNotFoundException extends AppException {
  constructor(workflowId: string) {
    super(
      ErrorCode.WORKFLOW_NOT_FOUND,
      `Workflow with ID "${workflowId}" not found`,
      HttpStatus.NOT_FOUND,
      { workflowId },
    );
  }
}

/**
 * Excepción: Workflow ya existe
 * Se lanza cuando intentan crear un workflow con un nombre que ya existe
 */
export class WorkflowAlreadyExistsException extends AppException {
  constructor(name: string) {
    super(
      ErrorCode.WORKFLOW_ALREADY_EXISTS,
      `A workflow with the name "${name}" already exists`,
      HttpStatus.CONFLICT,
      { name },
    );
  }
}

/**
 * Excepción: Configuración inválida
 * Se lanza cuando el config JSON del workflow es inválido
 */
export class InvalidWorkflowConfigException extends AppException {
  constructor(reason: string, config?: any) {
    super(
      ErrorCode.INVALID_CONFIG,
      `Invalid workflow configuration: ${reason}`,
      HttpStatus.BAD_REQUEST,
      { reason, config },
    );
  }
}

/**
 * Excepción: Límite de workflows excedido
 * Se lanza cuando el cliente alcanza su maxWorkflows según el plan
 */
export class MaxWorkflowsExceededException extends AppException {
  constructor(currentCount: number, maxAllowed: number) {
    super(
      ErrorCode.MAX_WORKFLOWS_EXCEEDED,
      `You have reached the maximum number of workflows (${currentCount}/${maxAllowed}). Please upgrade your plan.`,
      HttpStatus.FORBIDDEN,
      { currentCount, maxAllowed },
    );
  }
}

/**
 * Excepción: Workflow pausado
 * Se lanza cuando intentan ejecutar un workflow que está pausado
 */
export class WorkflowPausedException extends AppException {
  constructor(workflowId: string) {
    super(
      ErrorCode.WORKFLOW_IS_PAUSED,
      `Workflow "${workflowId}" is currently paused and cannot be executed`,
      HttpStatus.CONFLICT,
      { workflowId },
    );
  }
}

/**
 * Excepción: Webhook de n8n inválido
 * Se lanza cuando la URL del webhook de n8n es inválida
 */
export class InvalidN8nWebhookException extends AppException {
  constructor(webhookUrl: string, reason?: string) {
    super(
      ErrorCode.INVALID_N8N_WEBHOOK,
      reason
        ? `Invalid n8n webhook URL: ${reason}`
        : 'The provided n8n webhook URL is invalid',
      HttpStatus.BAD_REQUEST,
      { webhookUrl, reason },
    );
  }
}

/**
 * Excepción: Steps de workflow custom inválidos
 * Se lanza cuando los steps del workflow custom son inválidos
 */
export class InvalidCustomStepsException extends AppException {
  constructor(reason: string, steps?: any) {
    super(
      ErrorCode.INVALID_CUSTOM_STEPS,
      `Invalid workflow steps: ${reason}`,
      HttpStatus.BAD_REQUEST,
      { reason, steps },
    );
  }
}

/**
 * Excepción: Workflow tiene ejecuciones activas
 * Se lanza cuando intentan eliminar un workflow con ejecuciones en progreso
 */
export class WorkflowHasActiveExecutionsException extends AppException {
  constructor(workflowId: string, activeExecutionsCount: number) {
    super(
      ErrorCode.WORKFLOW_HAS_ACTIVE_EXECUTIONS,
      `Cannot delete workflow "${workflowId}". It has ${activeExecutionsCount} active execution(s) in progress.`,
      HttpStatus.CONFLICT,
      { workflowId, activeExecutionsCount },
    );
  }
}

/**
 * Excepción: Cron expression inválido
 * Se lanza cuando el schedule cron expression es inválido
 */
export class InvalidCronExpressionException extends AppException {
  constructor(cronExpression: string, reason?: string) {
    super(
      ErrorCode.INVALID_CRON_EXPRESSION,
      reason
        ? `Invalid cron expression "${cronExpression}": ${reason}`
        : `Invalid cron expression: "${cronExpression}"`,
      HttpStatus.BAD_REQUEST,
      { cronExpression, reason },
    );
  }
}

/**
 * Excepción: Timezone inválido
 * Se lanza cuando el timezone especificado no es válido
 */
export class InvalidTimezoneException extends AppException {
  constructor(timezone: string) {
    super(
      ErrorCode.INVALID_TIMEZONE,
      `Invalid timezone: "${timezone}"`,
      HttpStatus.BAD_REQUEST,
      { timezone },
    );
  }
}