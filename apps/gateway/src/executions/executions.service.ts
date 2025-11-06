import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * Service que maneja el historial de ejecuciones
 * 
 * Responsabilidades:
 * - Crear registros de Execution cuando se ejecuta un workflow
 * - Actualizar el estado de las ejecuciones (pending → running → completed/failed)
 * - Consultar historial de ejecuciones
 * - Calcular estadísticas de workflows
 */
@Injectable()
export class ExecutionsService {
  private readonly logger = new Logger(ExecutionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crear una nueva ejecución
   * Se llama cuando un workflow empieza a ejecutarse
   * 
   * @param workflowId - ID del workflow que se ejecuta
   * @param trigger - Cómo se disparó (api, webhook, schedule, manual)
   * @param triggerData - Datos del trigger (IP, payload, metadata, etc.)
   * @returns La ejecución creada con status="pending"
   */
  async create(
    workflowId: string,
    trigger: 'api' | 'webhook' | 'schedule' | 'manual',
    triggerData?: any,
  ) {
    const execution = await this.prisma.execution.create({
      data: {
        workflowId,
        status: 'pending',
        trigger,
        triggerData: triggerData || {},
        startedAt: new Date(),
      },
      include: {
        workflow: {
          select: {
            id: true,
            name: true,
            clientId: true,
          },
        },
      },
    });

    this.logger.log(
      `Ejecución creada: ${execution.id} para workflow ${workflowId}`,
    );

    return execution;
  }

  /**
   * Actualizar el estado de una ejecución
   * Se llama cuando la ejecución cambia de estado
   * 
   * @param executionId - ID de la ejecución
   * @param status - Nuevo estado (running, completed, failed, cancelled, timeout)
   * @param data - Datos adicionales (result, error, logs, etc.)
   */
  async updateStatus(
    executionId: string,
    status: 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout',
    data?: {
      result?: any;
      error?: string;
      errorStack?: string;
      logs?: string;
      stepResults?: any;
      cost?: number;
      credits?: number;
    },
  ) {
    const now = new Date();
    const execution = await this.prisma.execution.findUnique({
      where: { id: executionId },
      select: { startedAt: true, workflowId: true },
    });

    if (!execution) {
      throw new NotFoundException(`Ejecución ${executionId} no encontrada`);
    }

    // Calcular duración en segundos
    const duration = Math.floor(
      (now.getTime() - execution.startedAt.getTime()) / 1000,
    );

    // Actualizar la ejecución
    const updated = await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        status,
        finishedAt: ['completed', 'failed', 'cancelled', 'timeout'].includes(status)
          ? now
          : undefined,
        duration: ['completed', 'failed', 'cancelled', 'timeout'].includes(status)
          ? duration
          : undefined,
        result: data?.result,
        error: data?.error,
        errorStack: data?.errorStack,
        logs: data?.logs,
        stepResults: data?.stepResults,
        cost: data?.cost,
        credits: data?.credits,
      },
    });

    // Si la ejecución terminó (completed o failed), actualizar estadísticas del workflow
    if (status === 'completed' || status === 'failed') {
      await this.updateWorkflowStats(execution.workflowId, status, duration);
    }

    this.logger.log(
      `Ejecución ${executionId} actualizada a estado: ${status} (duración: ${duration}s)`,
    );

    return updated;
  }

  /**
   * Actualizar estadísticas del workflow
   * Incrementa contadores y calcula promedio de tiempo de ejecución
   * 
   * @param workflowId - ID del workflow
   * @param status - Estado final de la ejecución (completed o failed)
   * @param duration - Duración de la ejecución en segundos
   */
  private async updateWorkflowStats(
    workflowId: string,
    status: 'completed' | 'failed',
    duration: number,
  ) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      select: {
        totalExecutions: true,
        successfulExecutions: true,
        failedExecutions: true,
        avgExecutionTime: true,
      },
    });

    if (!workflow) return;

    // Calcular nuevo promedio de tiempo de ejecución
    const totalExecs = workflow.totalExecutions;
    const currentAvg = workflow.avgExecutionTime || 0;
    const newAvg = Math.floor(
      (currentAvg * totalExecs + duration) / (totalExecs + 1),
    );

    // Actualizar workflow
    await this.prisma.workflow.update({
      where: { id: workflowId },
      data: {
        totalExecutions: { increment: 1 },
        successfulExecutions:
          status === 'completed'
            ? { increment: 1 }
            : undefined,
        failedExecutions:
          status === 'failed'
            ? { increment: 1 }
            : undefined,
        avgExecutionTime: newAvg,
        lastExecutedAt: new Date(),
      },
    });

    this.logger.log(
      `Estadísticas actualizadas para workflow ${workflowId}: total=${totalExecs + 1}, avg=${newAvg}s`,
    );
  }

  /**
   * Obtener una ejecución por ID
   * 
   * @param executionId - ID de la ejecución
   * @param clientId - ID del cliente (para verificar ownership)
   */
  async findOne(executionId: string, clientId: string) {
    const execution = await this.prisma.execution.findFirst({
      where: {
        id: executionId,
        workflow: {
          clientId,
          deletedAt: null,
        },
      },
      include: {
        workflow: {
          select: {
            id: true,
            name: true,
            clientId: true,
          },
        },
      },
    });

    if (!execution) {
      throw new NotFoundException('Ejecución no encontrada');
    }

    return execution;
  }

  /**
   * Listar ejecuciones de un workflow
   * 
   * @param workflowId - ID del workflow
   * @param clientId - ID del cliente (para verificar ownership)
   * @param limit - Número máximo de resultados (default: 50)
   * @param status - Filtrar por estado (opcional)
   */
  async findByWorkflow(
    workflowId: string,
    clientId: string,
    limit: number = 50,
    status?: string,
  ) {
    // Verificar que el workflow pertenece al cliente
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id: workflowId,
        clientId,
        deletedAt: null,
      },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow no encontrado');
    }

    // Buscar ejecuciones
    return this.prisma.execution.findMany({
      where: {
        workflowId,
        ...(status && { status }),
      },
      orderBy: {
        startedAt: 'desc',
      },
      take: limit,
    });
  }

  /**
   * Cancelar una ejecución en progreso
   * 
   * @param executionId - ID de la ejecución
   * @param clientId - ID del cliente (para verificar ownership)
   */
  async cancel(executionId: string, clientId: string) {
    const execution = await this.findOne(executionId, clientId);

    if (!['pending', 'running'].includes(execution.status)) {
      throw new Error(
        `No se puede cancelar una ejecución con estado: ${execution.status}`,
      );
    }

    return this.updateStatus(executionId, 'cancelled', {
      error: 'Execution cancelled by user',
    });
  }
}
