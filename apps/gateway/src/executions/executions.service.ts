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
   * @param triggerData - Datos del trigger (IP, payload, metadata, organizationId, userId, apiKeyId, etc.)
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
        organizationId: triggerData?.organizationId,
        userId: triggerData?.userId,
        apiKeyId: triggerData?.apiKeyId,
      },
      include: {
        workflow: {
          select: {
            id: true,
            name: true,
            organizationId: true,
          },
        },
      },
    });

    this.logger.log(
      `Ejecución creada: ${execution.id} para workflow ${workflowId} (trigger: ${trigger}, org: ${triggerData?.organizationId || 'N/A'}, userId: ${triggerData?.userId || 'N/A'}, apiKeyId: ${triggerData?.apiKeyId || 'N/A'})`,
    );

    return execution;
  }

  /**
   * Actualizar el estado de una ejecución
   * Se llama cuando la ejecución cambia de estado
   *
   * @param executionId - ID de la ejecución
   * @param status - Nuevo estado (running, completed, failed, cancelled, timeout)
   * @param data - Datos adicionales (result, error, logs, tokens, cost, etc.)
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
      tokensUsed?: number; // ← Agregado para consolidar updates
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

    // Actualizar la ejecución (TODOS los campos en 1 query)
    const updated = await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        status,
        finishedAt: ['completed', 'failed', 'cancelled', 'timeout'].includes(
          status,
        )
          ? now
          : undefined,
        duration: ['completed', 'failed', 'cancelled', 'timeout'].includes(
          status,
        )
          ? duration
          : undefined,
        result: data?.result,
        error: data?.error,
        errorStack: data?.errorStack,
        logs: data?.logs,
        stepResults: data?.stepResults,
        cost: data?.cost,
        credits: data?.credits,
        tokensUsed: data?.tokensUsed, // ← Incluido en el mismo update
      },
    });

    // Si la ejecución terminó (completed o failed), actualizar estadísticas del workflow
    if (status === 'completed' || status === 'failed') {
      await this.updateWorkflowStats(execution.workflowId, status, duration);
    }

    this.logger.log(
      `Ejecución ${executionId} actualizada a estado: ${status} ` +
        `(duración: ${duration}s, tokens: ${data?.tokensUsed || 0}, cost: $${data?.cost || 0})`,
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
          status === 'completed' ? { increment: 1 } : undefined,
        failedExecutions: status === 'failed' ? { increment: 1 } : undefined,
        avgExecutionTime: newAvg,
        lastExecutedAt: new Date(),
      },
    });

    this.logger.log(
      `Estadísticas actualizadas para workflow ${workflowId}: total=${totalExecs + 1}, avg=${newAvg}s`,
    );
  }

  /**
   * Obtener una ejecución por ID (versión cliente)
   * Incluye información de créditos pero no costos internos
   *
   * @param executionId - ID de la ejecución
   * @param organizationId - ID de la organización (para verificar ownership)
   */
  async findOneForClient(executionId: string, organizationId: string) {
    const execution = await this.prisma.execution.findFirst({
      where: {
        id: executionId,
        workflow: {
          organizationId,
          deletedAt: null,
        },
      },
      select: {
        id: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        duration: true,
        result: true,
        error: true,
        trigger: true,
        triggerData: true,
        logs: true,
        stepResults: true,
        retryCount: true,
        createdAt: true,
        updatedAt: true,
        // Campos de créditos para clientes
        credits: true,
        balanceBefore: true,
        balanceAfter: true,
        wasOverage: true,
        // Relaciones
        workflowId: true,
        organizationId: true,
        conversationId: true,
        userId: true,
        apiKeyId: true,
        workflow: {
          select: {
            id: true,
            name: true,
            category: true,
            organizationId: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        apiKey: {
          select: {
            id: true,
            name: true,
            keyPrefix: true,
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
   * Obtener una ejecución por ID (versión admin)
   * Incluye TODOS los campos técnicos: cost, tokensUsed, errorStack, creditTransaction
   *
   * @param executionId - ID de la ejecución
   * @param organizationId - ID de la organización (opcional para super admin)
   */
  async findOneForAdmin(executionId: string, organizationId?: string) {
    const where: any = {
      id: executionId,
    };

    // Si se proporciona organizationId, filtrar por él
    if (organizationId) {
      where.workflow = {
        organizationId,
        deletedAt: null,
      };
    }

    const execution = await this.prisma.execution.findFirst({
      where,
      include: {
        workflow: {
          select: {
            id: true,
            name: true,
            category: true,
            organizationId: true,
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        apiKey: {
          select: {
            id: true,
            name: true,
            keyPrefix: true,
          },
        },
        conversation: {
          select: {
            id: true,
            channel: true,
            messageCount: true,
            totalTokens: true,
            totalCost: true,
          },
        },
        creditTransaction: {
          select: {
            id: true,
            type: true,
            amount: true,
            balanceBefore: true,
            balanceAfter: true,
            workflowCategory: true,
            costUSD: true,
            description: true,
            metadata: true,
            createdAt: true,
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
   * @param organizationId - ID de la organización (para verificar ownership)
   * @param limit - Número máximo de resultados (default: 50)
   * @param status - Filtrar por estado (opcional)
   */
  async findByWorkflow(
    workflowId: string,
    organizationId: string,
    limit = 50,
    status?: string,
  ) {
    // Verificar que el workflow pertenece a la organización
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId,
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
      select: {
        id: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        duration: true,
        trigger: true,
        error: true,
        retryCount: true,
        // Campos de créditos
        credits: true,
        balanceBefore: true,
        balanceAfter: true,
        wasOverage: true,
        // Relaciones
        workflowId: true,
        userId: true,
        apiKeyId: true,
        conversationId: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        apiKey: {
          select: {
            id: true,
            name: true,
            keyPrefix: true,
          },
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
      take: limit,
    });
  }

  /**
   * Listar todas las ejecuciones de la organización (versión cliente)
   * Con paginación cursor-based y filtros avanzados
   *
   * @param organizationId - ID de la organización
   * @param options - Opciones de filtrado y paginación
   */
  async findAll(
    organizationId: string,
    options: {
      limit?: number;
      cursor?: string;
      status?: string;
      workflowId?: string;
      trigger?: string;
      startDate?: Date;
      endDate?: Date;
      wasOverage?: boolean;
      userId?: string;
      apiKeyId?: string;
    } = {},
  ) {
    const {
      limit = 50,
      cursor,
      status,
      workflowId,
      trigger,
      startDate,
      endDate,
      wasOverage,
      userId,
      apiKeyId,
    } = options;

    // Limitar máximo a 100 registros por página
    const take = Math.min(limit, 100);

    // Construir filtros dinámicos
    const where: any = {
      workflow: {
        organizationId,
        deletedAt: null,
      },
    };

    if (status) where.status = status;
    if (workflowId) where.workflowId = workflowId;
    if (trigger) where.trigger = trigger;
    if (wasOverage !== undefined) where.wasOverage = wasOverage;
    if (userId) where.userId = userId;
    if (apiKeyId) where.apiKeyId = apiKeyId;

    // Filtro por rango de fechas
    if (startDate || endDate) {
      where.startedAt = {};
      if (startDate) where.startedAt.gte = startDate;
      if (endDate) where.startedAt.lte = endDate;
    }

    // Obtener total de registros que cumplen los criterios
    const total = await this.prisma.execution.count({ where });

    // Construir query con cursor si existe
    const queryOptions: any = {
      where,
      take: take + 1, // Tomar uno extra para saber si hay más
      orderBy: {
        startedAt: 'desc',
      },
      select: {
        id: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        duration: true,
        trigger: true,
        error: true,
        retryCount: true,
        // Campos de créditos para clientes
        credits: true,
        balanceBefore: true,
        balanceAfter: true,
        wasOverage: true,
        // Relaciones
        workflowId: true,
        organizationId: true,
        conversationId: true,
        userId: true,
        apiKeyId: true,
        workflow: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        apiKey: {
          select: {
            id: true,
            name: true,
            keyPrefix: true,
          },
        },
      },
    };

    // Si hay cursor, empezar desde ese punto
    if (cursor) {
      queryOptions.cursor = { id: cursor };
      queryOptions.skip = 1; // Skip el cursor mismo
    }

    // Obtener ejecuciones
    const results = await this.prisma.execution.findMany(queryOptions);

    // Determinar si hay más resultados
    const hasMore = results.length > take;
    const executions = hasMore ? results.slice(0, take) : results;

    // El siguiente cursor es el ID del último elemento
    const nextCursor = hasMore ? executions[executions.length - 1].id : null;

    return {
      data: executions,
      pagination: {
        total,
        limit: take,
        nextCursor,
        hasMore,
      },
    };
  }

  /**
   * Listar todas las ejecuciones (versión admin)
   * Incluye campos técnicos: cost, tokensUsed, creditTransaction
   *
   * @param organizationId - ID de la organización (opcional para super admin)
   * @param options - Opciones de filtrado y paginación
   */
  async findAllForAdmin(
    organizationId: string | undefined,
    options: {
      limit?: number;
      cursor?: string;
      status?: string;
      workflowId?: string;
      trigger?: string;
      startDate?: Date;
      endDate?: Date;
      wasOverage?: boolean;
      userId?: string;
      apiKeyId?: string;
    } = {},
  ) {
    const {
      limit = 50,
      cursor,
      status,
      workflowId,
      trigger,
      startDate,
      endDate,
      wasOverage,
      userId,
      apiKeyId,
    } = options;

    // Limitar máximo a 100 registros por página
    const take = Math.min(limit, 100);

    // Construir filtros dinámicos
    const where: any = {};

    // Si se proporciona organizationId, filtrar por él
    if (organizationId) {
      where.workflow = {
        organizationId,
        deletedAt: null,
      };
    }

    if (status) where.status = status;
    if (workflowId) where.workflowId = workflowId;
    if (trigger) where.trigger = trigger;
    if (wasOverage !== undefined) where.wasOverage = wasOverage;
    if (userId) where.userId = userId;
    if (apiKeyId) where.apiKeyId = apiKeyId;

    // Filtro por rango de fechas
    if (startDate || endDate) {
      where.startedAt = {};
      if (startDate) where.startedAt.gte = startDate;
      if (endDate) where.startedAt.lte = endDate;
    }

    // Obtener total de registros que cumplen los criterios
    const total = await this.prisma.execution.count({ where });

    // Construir query con cursor si existe
    const queryOptions: any = {
      where,
      take: take + 1, // Tomar uno extra para saber si hay más
      orderBy: {
        startedAt: 'desc',
      },
      include: {
        workflow: {
          select: {
            id: true,
            name: true,
            category: true,
            organizationId: true,
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        apiKey: {
          select: {
            id: true,
            name: true,
            keyPrefix: true,
          },
        },
        conversation: {
          select: {
            id: true,
            channel: true,
            messageCount: true,
          },
        },
        creditTransaction: {
          select: {
            id: true,
            type: true,
            amount: true,
            balanceBefore: true,
            balanceAfter: true,
            workflowCategory: true,
            costUSD: true,
            description: true,
            createdAt: true,
          },
        },
      },
    };

    // Si hay cursor, empezar desde ese punto
    if (cursor) {
      queryOptions.cursor = { id: cursor };
      queryOptions.skip = 1; // Skip el cursor mismo
    }

    // Obtener ejecuciones
    const results = await this.prisma.execution.findMany(queryOptions);

    // Determinar si hay más resultados
    const hasMore = results.length > take;
    const executions = hasMore ? results.slice(0, take) : results;

    // El siguiente cursor es el ID del último elemento
    const nextCursor = hasMore ? executions[executions.length - 1].id : null;

    return {
      data: executions,
      pagination: {
        total,
        limit: take,
        nextCursor,
        hasMore,
      },
    };
  }

  /**
   * Obtener estadísticas de ejecuciones de la organización
   * Incluye información de créditos y categorías de workflow
   *
   * @param organizationId - ID de la organización
   * @param period - Periodo de tiempo (24h, 7d, 30d, 90d, all)
   */
  async getStats(organizationId: string, period = '7d') {
    // Calcular fecha de inicio según el periodo
    const now = new Date();
    let startDate: Date | undefined;

    switch (period) {
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        startDate = undefined;
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const where: any = {
      workflow: {
        organizationId,
        deletedAt: null,
      },
      ...(startDate && { startedAt: { gte: startDate } }),
    };

    // Obtener todas las ejecuciones del periodo con info de créditos
    const executions = await this.prisma.execution.findMany({
      where,
      select: {
        id: true,
        status: true,
        trigger: true,
        duration: true,
        workflowId: true,
        credits: true,
        wasOverage: true,
        workflow: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
      },
    });

    // Calcular estadísticas
    const total = executions.length;
    const successful = executions.filter(
      (e: any) => e.status === 'completed',
    ).length;
    const failed = executions.filter((e: any) => e.status === 'failed').length;
    const cancelled = executions.filter(
      (e: any) => e.status === 'cancelled',
    ).length;
    const timeout = executions.filter(
      (e: any) => e.status === 'timeout',
    ).length;

    const successRate = total > 0 ? (successful / total) * 100 : 0;

    // Calcular duración total y promedio
    const completedExecutions = executions.filter(
      (e: any) => e.duration !== null,
    );
    const totalDuration = completedExecutions.reduce(
      (sum: any, e: any) => sum + (e.duration || 0),
      0,
    );
    const avgDuration =
      completedExecutions.length > 0
        ? totalDuration / completedExecutions.length
        : 0;

    // Agrupar por estado
    const byStatus: Record<string, number> = {
      completed: successful,
      failed,
      cancelled,
      timeout,
      pending: executions.filter((e: any) => e.status === 'pending').length,
      running: executions.filter((e: any) => e.status === 'running').length,
    };

    // Agrupar por trigger
    const byTrigger: Record<string, number> = {};
    executions.forEach((e: any) => {
      byTrigger[e.trigger] = (byTrigger[e.trigger] || 0) + 1;
    });

    // Top workflows por número de ejecuciones
    const workflowStats = new Map<
      string,
      { name: string; total: number; successful: number }
    >();

    executions.forEach((e: any) => {
      const existing = workflowStats.get(e.workflowId) || {
        name: e.workflow.name,
        total: 0,
        successful: 0,
      };
      existing.total += 1;
      if (e.status === 'completed') {
        existing.successful += 1;
      }
      workflowStats.set(e.workflowId, existing);
    });

    const topWorkflows = Array.from(workflowStats.entries())
      .map(([workflowId, stats]) => ({
        workflowId,
        workflowName: stats.name,
        executions: stats.total,
        successRate:
          stats.total > 0 ? (stats.successful / stats.total) * 100 : 0,
      }))
      .sort((a, b) => b.executions - a.executions)
      .slice(0, 10);

    // Calcular estadísticas de créditos
    const totalCreditsConsumed = executions.reduce(
      (sum: number, e: any) => sum + (e.credits || 0),
      0,
    );

    const executionsInOverage = executions.filter(
      (e: any) => e.wasOverage === true,
    ).length;

    const overageRate = total > 0 ? (executionsInOverage / total) * 100 : 0;

    const avgCreditsPerExecution = total > 0 ? totalCreditsConsumed / total : 0;

    // Agrupar por categoría de workflow
    const byWorkflowCategory: Record<
      string,
      { count: number; credits: number }
    > = {
      LIGHT: { count: 0, credits: 0 },
      STANDARD: { count: 0, credits: 0 },
      ADVANCED: { count: 0, credits: 0 },
    };

    executions.forEach((e: any) => {
      const category = e.workflow?.category;
      if (category && byWorkflowCategory[category]) {
        byWorkflowCategory[category].count += 1;
        byWorkflowCategory[category].credits += e.credits || 0;
      }
    });

    return {
      period,
      total,
      successful,
      failed,
      cancelled,
      timeout,
      successRate: parseFloat(successRate.toFixed(2)),
      avgDuration: parseFloat(avgDuration.toFixed(2)),
      totalDuration,
      byStatus,
      byTrigger,
      topWorkflows,
      // Estadísticas de créditos
      credits: {
        totalConsumed: totalCreditsConsumed,
        avgPerExecution: parseFloat(avgCreditsPerExecution.toFixed(2)),
        executionsInOverage,
        overageRate: parseFloat(overageRate.toFixed(2)),
        byCategory: byWorkflowCategory,
      },
    };
  }

  /**
   * Cancelar una ejecución en progreso
   *
   * @param executionId - ID de la ejecución
   * @param organizationId - ID de la organización (para verificar ownership)
   */
  async cancel(executionId: string, organizationId: string) {
    const execution = await this.findOneForClient(executionId, organizationId);

    if (!['pending', 'running'].includes(execution.status)) {
      throw new Error(
        `No se puede cancelar una ejecución con estado: ${execution.status}`,
      );
    }

    return this.updateStatus(executionId, 'cancelled', {
      error: 'Execution cancelled by user',
    });
  }

  /**
   * Obtener estadísticas de ejecuciones agrupadas por fuente (API key o usuario)
   *
   * @param workflowId - ID del workflow
   * @param organizationId - ID de la organización
   * @param period - Periodo de tiempo (24h, 7d, 30d, 90d, all)
   */
  async getAnalyticsBySource(
    workflowId: string,
    organizationId: string,
    period = '30d',
  ) {
    // Verificar que el workflow pertenece a la organización
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId,
        deletedAt: null,
      },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow no encontrado');
    }

    // Calcular fecha de inicio según el periodo
    const now = new Date();
    let startDate: Date | undefined;

    switch (period) {
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        startDate = undefined;
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const where: any = {
      workflowId,
      ...(startDate && { startedAt: { gte: startDate } }),
    };

    // Obtener todas las ejecuciones del periodo
    const executions = await this.prisma.execution.findMany({
      where,
      select: {
        id: true,
        status: true,
        duration: true,
        apiKeyId: true,
        userId: true,
        apiKey: {
          select: {
            id: true,
            name: true,
            keyPrefix: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Agrupar por API Key
    const byApiKey = new Map<
      string,
      {
        name: string;
        keyPrefix: string;
        total: number;
        successful: number;
        failed: number;
        avgDuration: number;
      }
    >();

    // Agrupar por Usuario
    const byUser = new Map<
      string,
      {
        name: string;
        email: string;
        total: number;
        successful: number;
        failed: number;
        avgDuration: number;
      }
    >();

    executions.forEach((e: any) => {
      if (e.apiKeyId && e.apiKey) {
        const existing = byApiKey.get(e.apiKeyId) || {
          name: e.apiKey.name,
          keyPrefix: e.apiKey.keyPrefix,
          total: 0,
          successful: 0,
          failed: 0,
          avgDuration: 0,
        };
        existing.total += 1;
        if (e.status === 'completed') existing.successful += 1;
        if (e.status === 'failed') existing.failed += 1;
        if (e.duration) {
          existing.avgDuration =
            (existing.avgDuration * (existing.total - 1) + e.duration) /
            existing.total;
        }
        byApiKey.set(e.apiKeyId, existing);
      }

      if (e.userId && e.user) {
        const existing = byUser.get(e.userId) || {
          name: e.user.name,
          email: e.user.email,
          total: 0,
          successful: 0,
          failed: 0,
          avgDuration: 0,
        };
        existing.total += 1;
        if (e.status === 'completed') existing.successful += 1;
        if (e.status === 'failed') existing.failed += 1;
        if (e.duration) {
          existing.avgDuration =
            (existing.avgDuration * (existing.total - 1) + e.duration) /
            existing.total;
        }
        byUser.set(e.userId, existing);
      }
    });

    return {
      workflowId,
      workflowName: workflow.name,
      period,
      totalExecutions: executions.length,
      byApiKey: Array.from(byApiKey.entries()).map(([apiKeyId, stats]) => ({
        apiKeyId,
        ...stats,
        successRate:
          stats.total > 0 ? (stats.successful / stats.total) * 100 : 0,
        avgDuration: parseFloat(stats.avgDuration.toFixed(2)),
      })),
      byUser: Array.from(byUser.entries()).map(([userId, stats]) => ({
        userId,
        ...stats,
        successRate:
          stats.total > 0 ? (stats.successful / stats.total) * 100 : 0,
        avgDuration: parseFloat(stats.avgDuration.toFixed(2)),
      })),
    };
  }

  /**
   * Asocia una ejecución a una conversación
   *
   * @param executionId - ID de la ejecución
   * @param conversationId - ID de la conversación
   */
  async linkToConversation(executionId: string, conversationId: string) {
    await this.prisma.execution.update({
      where: { id: executionId },
      data: { conversationId },
    });

    this.logger.debug(
      `Ejecución ${executionId} asociada a conversación ${conversationId}`,
    );
  }

  /**
   * Actualiza las estadísticas de uso (tokens y costo) de una ejecución
   *
   * @param executionId - ID de la ejecución
   * @param tokensUsed - Tokens consumidos
   * @param cost - Costo en USD
   */
  async updateUsageStats(
    executionId: string,
    tokensUsed: number,
    cost: number,
  ) {
    await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        tokensUsed,
        cost,
      },
    });

    this.logger.debug(
      `Estadísticas actualizadas para ejecución ${executionId}: ${tokensUsed} tokens, $${cost}`,
    );
  }
}
