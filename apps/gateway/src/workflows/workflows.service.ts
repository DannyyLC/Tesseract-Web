import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CursorPaginatedResponse,
  getWorkflowCreditCost,
  PaginatedResponse,
  PLANS,
  SubscriptionPlan,
  WorkflowCategory,
} from '@workflow-automation/shared-types';
import { Transform, PassThrough } from 'stream';
import { AgentsService } from '../agents/agents.service';
import { ToolsService } from '../tools/tools.service';
import { UserType } from '../agents/dto/agent-execution-request.dto';
import {
  InvalidWorkflowConfigException,
  WorkflowNotFoundException,
  WorkflowPausedException,
} from '../common/exceptions';
import { CursorPaginatedResponseUtils } from '../common/responses/cursor-paginated-response';
import { ConversationsService } from '../conversations/conversations.service';
import { CreditsService } from '../credits/credits.service';
import { PrismaService } from '../database/prisma.service';
import { ExecutionsService } from '../executions/executions.service';
import { LlmModelsService } from '../llm-models/llm-models.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { WorkflowMetricsDto } from './dto/workflow-metrics.dto';
import { WorkflowStatsDto } from './dto/workflow-stats.dto';
import { DashboardWorkflowDto } from './dto';

/**
 * Service que maneja la lógica de negocio de workflows
 * Incluye validación de límites según el plan de la organización
 */
@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionsService: ExecutionsService,
    private readonly organizationsService: OrganizationsService,
    private readonly agentsService: AgentsService,
    private readonly creditsService: CreditsService,
    private readonly llmModelsService: LlmModelsService,
    private readonly conversationsService: ConversationsService,
    private readonly toolsService: ToolsService,
  ) { }

  //==========================================================
  // CRUD DE WORKFLOWS
  //==========================================================
  /**
   * Crear un nuevo workflow
   */
  async create(organizationId: string, dto: CreateWorkflowDto) {
    await this.validateConfig(dto.config);

    // Validar límite de workflows según el plan
    const canAdd = await this.organizationsService.canAddWorkflow(organizationId);
    if (!canAdd) {
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { plan: true },
      });
      const limit = PLANS[org!.plan as SubscriptionPlan].limits.maxWorkflows;
      throw new ForbiddenException(
        limit === -1
          ? 'No se pueden crear más workflows'
          : `Has alcanzado el límite de ${limit} workflows para tu plan`,
      );
    }

    const workflow = await this.prisma.workflow.create({
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category,
        maxTokensPerExecution: dto.maxTokensPerExecution,
        config: dto.config as any,
        isActive: dto.isActive ?? true,
        isPaused: dto.isPaused ?? false,
        schedule: dto.schedule,
        timezone: dto.timezone ?? 'UTC',
        timeout: dto.timeout ?? 300,
        maxRetries: dto.maxRetries ?? 3,
        triggerType: dto.triggerType ? [dto.triggerType] : undefined,
        organizationId,
        // Asociar tags si se proporcionaron
        ...(dto.tagIds && {
          tags: {
            connect: dto.tagIds.map((id) => ({ id })),
          },
        }),
      },
      include: {
        tags: true,
      },
    });

    this.logger.log(`Workflow creado ${workflow.id} en organización ${organizationId}`);
    return workflow;
  }

  /**
   * Listar workflows para el dashboard
   */
  async getDashboardData(
    organizationId: string,
    cursor?: string | null,
    take = 10,
    paginationAction: 'next' | 'prev' | null = null,
    filters?: {
      search?: string;
      isActive?: boolean;
      category?: WorkflowCategory;
    },
  ): Promise<CursorPaginatedResponse<DashboardWorkflowDto>> {
    const where: any = {
      organizationId,
      deletedAt: null,
      ...(filters?.isActive !== undefined && { isActive: filters.isActive }),
      ...(filters?.category && { category: filters.category }),
      ...(filters?.search && {
        OR: [{ name: { contains: filters.search, mode: 'insensitive' } }],
      }),
    };

    const workflows = await this.prisma.workflow.findMany({
      take: paginationAction === 'prev' ? -(take + 1) : take + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      where,
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        category: true,
        lastExecutedAt: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const paginatedRes = await CursorPaginatedResponseUtils.getInstance().build(
      workflows,
      take,
      paginationAction,
    );

    const items = paginatedRes.items.map((wf) => ({
      id: wf.id,
      name: wf.name,
      description: wf.description,
      isActive: wf.isActive,
      category: wf.category,
      lastExecutedAt: wf.lastExecutedAt,
    }));

    return {
      items,
      nextCursor: paginatedRes.nextCursor,
      prevCursor: paginatedRes.prevCursor,
      nextPageAvailable: paginatedRes.nextPageAvailable,
      pageSize: paginatedRes.pageSize,
    };
  }

  /**
   * Obtener estadísticas globales de workflows
   */
  async getStats(organizationId: string): Promise<WorkflowStatsDto> {
    const now = new Date();

    // Get organization's ACTIVE subscription to use their billing period
    // Fallback to calendar month for FREE plan or canceled subscriptions
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        organizationId,
        status: 'ACTIVE', // Only use active subscriptions
      },
      select: { currentPeriodStart: true },
    });

    const startOfPeriod =
      subscription?.currentPeriodStart ?? new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalWorkflows, activeWorkflows, executionsMonth, creditsMonth, byCategory] =
      await Promise.all([
        // Total Workflows
        this.prisma.workflow.count({
          where: { organizationId, deletedAt: null },
        }),
        // Active Workflows
        this.prisma.workflow.count({
          where: { organizationId, deletedAt: null, isActive: true },
        }),
        // Total Executions Month
        this.prisma.execution.count({
          where: {
            organizationId,
            startedAt: { gte: startOfPeriod },
          },
        }),
        // Credits Consumed Month (Query from CreditTransactions)
        this.prisma.creditTransaction.aggregate({
          _sum: { amount: true },
          where: {
            organizationId,
            createdAt: { gte: startOfPeriod },
            amount: { lt: 0 }, // Gastos son negativos
          },
        }),
        // By Category
        this.prisma.workflow.groupBy({
          by: ['category'],
          where: { organizationId, deletedAt: null },
          _count: true,
        }),
      ]);

    const categoryStats: Record<string, number> = {};
    byCategory.forEach((item) => {
      categoryStats[item.category] = item._count;
    });

    // Credits amount comes negative for spending, convert to positive for "consumed"
    const consumed = Math.abs(creditsMonth._sum.amount || 0);

    return {
      totalWorkflows,
      activeWorkflows,
      totalExecutionsMonth: executionsMonth,
      creditsConsumedMonth: Number(consumed.toFixed(2)),
      byCategory: categoryStats,
    };
  }

  /**
   * Obtener un workflow específico (Metadata only, NO CONFIG)
   */
  async findOne(organizationId: string, workflowId: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        isActive: true,
        isPaused: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow no encontrado');
    }

    return workflow;
  }

  /**
   * Obtener métricas detalladas de un workflow (Charts, KPIs)
   */
  async getMetrics(
    organizationId: string,
    workflowId: string,
    period = '30d',
  ): Promise<WorkflowMetricsDto> {
    // Validate existence
    const wf = await this.prisma.workflow.findFirst({
      where: { id: workflowId, organizationId },
    });
    if (!wf) throw new NotFoundException('Workflow no encontrado');

    // Determine granularity and date range
    const now = new Date();
    let startDate = new Date();
    let granularity: 'hour' | 'day' | 'week' | 'month';
    let groupByClause: string;

    if (period === '24h') {
      // Today from 00:00 to current hour (hourly granularity)
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      granularity = 'hour';
      groupByClause = `TO_CHAR("startedAt", 'YYYY-MM-DD HH24:00:00')`;
    } else if (period === 'all') {
      // Adaptive granularity based on workflow age
      const daysSinceCreation = Math.floor(
        (now.getTime() - wf.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysSinceCreation > 365) {
        granularity = 'month';
        groupByClause = `TO_CHAR("startedAt", 'YYYY-MM')`;
        // Normalize to start of month
        startDate = new Date(wf.createdAt);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
      } else if (daysSinceCreation > 90) {
        granularity = 'week';
        groupByClause = `TO_CHAR("startedAt", 'IYYY-"W"IW')`;
        // Normalize to start of week (Monday)
        startDate = new Date(wf.createdAt);
        const day = startDate.getDay();
        const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
        startDate.setDate(diff);
        startDate.setHours(0, 0, 0, 0);
      } else {
        granularity = 'day';
        groupByClause = `TO_CHAR("startedAt", 'YYYY-MM-DD')`;
        // Normalize to start of day
        startDate = new Date(wf.createdAt);
        startDate.setHours(0, 0, 0, 0);
      }
    } else {
      // 7d, 30d, 90d - daily granularity
      granularity = 'day';
      groupByClause = `TO_CHAR("startedAt", 'YYYY-MM-DD')`;

      if (period === '7d') {
        startDate.setDate(startDate.getDate() - 6);
      } else if (period === '90d') {
        startDate.setDate(startDate.getDate() - 89);
      } else {
        startDate.setDate(startDate.getDate() - 29);
      }

      // Clamp to createdAt if workflow is newer than the requested period
      const workflowCreatedAt = new Date(wf.createdAt);
      if (workflowCreatedAt > startDate) {
        startDate = workflowCreatedAt;
      }

      // Normalize to start of day
      startDate.setHours(0, 0, 0, 0);
    }

    // Parallel Queries for Efficiency
    const [aggregations, failedExecutions, historyRaw] = await Promise.all([
      // A. KPI Aggregations (DB does the math)
      this.prisma.execution.aggregate({
        where: {
          workflowId,
          startedAt: { gte: startDate },
        },
        _count: {
          id: true, // Total
        },
        _avg: {
          duration: true, // Avg Duration
        },
      }),

      // B. Success Rate Helper (DB Count Only)
      this.prisma.execution.groupBy({
        by: ['status'],
        where: {
          workflowId,
          startedAt: { gte: startDate },
        },
        _count: true,
      }),

      // C. Dynamic History (Raw SQL with adaptive grouping)
      // Using TO_CHAR consistently to ensure string format matches JavaScript
      // C. Dynamic History (Raw SQL with adaptive grouping)
      // Using TO_CHAR consistently to ensure string format matches JavaScript
      this.prisma.$queryRawUnsafe<
        { date: string; success: number; failed: number; count: number }[]
      >(
        `
        SELECT 
          ${groupByClause} as date,
          COUNT(CASE WHEN status = 'completed' THEN 1 END)::int as success,
          COUNT(CASE WHEN status = 'failed' THEN 1 END)::int as failed,
          COUNT(*)::int as count
        FROM executions 
        WHERE "workflowId" = $1 
          AND "startedAt" >= $2
        GROUP BY ${groupByClause}
        ORDER BY date ASC
      `,
        workflowId,
        startDate,
      ),
    ]);

    // Process Results

    // KPI Processing
    const totalExecutions = aggregations._count.id;
    const avgDuration = aggregations._avg.duration || 0;
    // Calculate Success Rate from GroupBy results
    const statusCounts = failedExecutions.reduce(
      (acc, curr) => {
        acc[curr.status] = curr._count;
        return acc;
      },
      {} as Record<string, number>,
    );

    const successfulCount = statusCounts.completed || 0;
    const failedCount = statusCounts.failed || 0;
    const successRate = totalExecutions > 0 ? (successfulCount / totalExecutions) * 100 : 0;

    // Error Distribution Processing
    const errorDistribution: Record<string, number> = {};
    if (failedCount > 0) {
      const failures = await this.prisma.execution.findMany({
        where: {
          workflowId,
          startedAt: { gte: startDate },
          status: 'failed',
          error: { not: null },
        },
        select: { error: true },
        take: 1000,
      });

      failures.forEach((f) => {
        let errorKey = 'GENERIC_ERROR';
        const errText = f.error || '';
        if (errText.toLowerCase().includes('timeout')) errorKey = 'TIMEOUT';
        else if (errText.includes('API')) errorKey = 'API_ERROR';
        else if (errText.includes('Rate limit')) errorKey = 'RATE_LIMIT';
        else if (errText.toLowerCase().includes('hallucination')) errorKey = 'HALLUCINATION';

        errorDistribution[errorKey] = (errorDistribution[errorKey] || 0) + 1;
      });
    }

    // Fill gaps in execution history
    const executionHistoryChart = this.fillHistoryGaps(
      historyRaw,
      startDate,
      now,
      granularity,
    );

    return {
      workflowId,
      totalExecutions,
      successRate: parseFloat(successRate.toFixed(1)),
      avgDuration: parseFloat(avgDuration.toFixed(2)),
      granularity,
      executionHistoryChart,
      errorDistribution,
    };
  }

  /**
   * Fill gaps in execution history to ensure complete chart data
   */
  private fillHistoryGaps(
    rawData: { date: string; success: number; failed: number; count: number }[],
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' | 'week' | 'month',
  ): { date: string; count: number; success: number; failed: number }[] {
    // Create a map from raw data (normalize keys to match our format)
    const dataMap = new Map<string, { count: number; success: number; failed: number }>();
    rawData.forEach((row) => {
      // SQL returns strings, use them directly
      const dateStr = String(row.date).trim();
      dataMap.set(dateStr, {
        count: Number(row.count),
        success: Number(row.success),
        failed: Number(row.failed),
      });
    });

    // Generate all time slots
    const result: { date: string; count: number; success: number; failed: number }[] = [];
    const current = new Date(startDate);

    // Loop until we reach the current period (not including incomplete future periods)
    while (current < endDate) {
      let dateKey: string;
      let shouldBreak = false;

      if (granularity === 'hour') {
        dateKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')} ${String(current.getHours()).padStart(2, '0')}:00:00`;
        current.setHours(current.getHours() + 1);
        // Stop if we've passed the current hour
        if (current > endDate) shouldBreak = true;
      } else if (granularity === 'day') {
        dateKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
        current.setDate(current.getDate() + 1);
        // Stop if we've passed today
        if (current > endDate) shouldBreak = true;
      } else if (granularity === 'week') {
        // ISO week format: YYYY-WNN
        const year = current.getFullYear();
        const weekNum = this.getISOWeek(current);
        dateKey = `${year}-W${String(weekNum).padStart(2, '0')}`;
        current.setDate(current.getDate() + 7);
        // Stop if we've passed the current week
        if (current > endDate) shouldBreak = true;
      } else {
        // month
        dateKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
        current.setMonth(current.getMonth() + 1);
        // Stop if we've passed the current month
        if (current > endDate) shouldBreak = true;
      }

      result.push({
        date: dateKey,
        count: dataMap.get(dateKey)?.count || 0,
        success: dataMap.get(dateKey)?.success || 0,
        failed: dataMap.get(dateKey)?.failed || 0,
      });

      if (shouldBreak) break;
    }

    return result;
  }

  /**
   * Get ISO week number for a date
   */
  private getISOWeek(date: Date): number {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
    }
    return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  }

  /**
   * Actualizar un workflow
   */
  async update(organizationId: string, workflowId: string, dto: UpdateWorkflowDto) {
    // 1. Verificar que existe y pertenece a la organización
    const existing = await this.findOne(organizationId, workflowId);

    // 2. Validar config si se está actualizando
    if (dto.config) {
      await this.validateConfig(dto.config);
    }

    // 3. Actualizar (incrementando versión)
    const workflow = await this.prisma.workflow.update({
      where: { id: workflowId },
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category,
        maxTokensPerExecution: dto.maxTokensPerExecution,
        config: dto.config as any,
        isActive: dto.isActive,
        isPaused: dto.isPaused,
        schedule: dto.schedule,
        timezone: dto.timezone,
        timeout: dto.timeout,
        maxRetries: dto.maxRetries,
        triggerType: dto.triggerType ? [dto.triggerType] : undefined,
        version: existing.version + 1, // Incrementar versión
        // Actualizar tags si se proporcionaron
        ...(dto.tagIds && {
          tags: {
            set: [], // Limpiar tags actuales
            connect: dto.tagIds.map((id) => ({ id })), // Conectar nuevos
          },
        }),
      },
      include: {
        tags: true,
      },
    });

    this.logger.log(`Workflow actualizado: ${workflowId} (versión ${workflow.version})`);
    return workflow;
  }

  /**
   * Eliminar un workflow (soft delete)
   */
  async remove(organizationId: string, workflowId: string) {
    // 1. Verificar que existe y pertenece a la organización
    await this.findOne(organizationId, workflowId);

    // 2. Soft delete
    const workflow = await this.prisma.workflow.update({
      where: { id: workflowId },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    this.logger.log(`Workflow eliminado: ${workflowId}`);
    return { message: 'Workflow eliminado exitosamente', workflow };
  }

  //==========================================================
  // Ejecutar Workflow
  //==========================================================
  /**
   * Ejecutar un workflow
   */
  async execute(
    organizationId: string,
    workflowId: string,
    input: Record<string, any>,
    metadata?: Record<string, any>,
    userId?: string, // Opcional: quién ejecuta desde UI
    apiKeyId?: string, // Opcional: qué API key ejecuta
    trigger: 'api' | 'manual' | 'webhook' | 'schedule' = 'api',
  ) {
    // 1. VALIDACIONES PREVIAS - Cargar workflow con TODO lo necesario en 1 query
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId,
        deletedAt: null,
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            plan: true,
          },
        },
        // Incluir tenantTools desde el inicio (evita query duplicado)
        tenantTools: {
          include: {
            credential: true,
            toolCatalog: {
              include: {
                functions: true,
              },
            },
          },
        },
      },
    });

    if (!workflow) {
      throw new WorkflowNotFoundException(workflowId);
    }

    if (!workflow.isActive) {
      throw new InvalidWorkflowConfigException('El workflow está inactivo', {
        workflowId,
        isActive: false,
      });
    }

    if (workflow.isPaused) {
      throw new WorkflowPausedException(workflowId);
    }

    // 2. VALIDAR ORGANIZACIÓN
    const org = workflow.organization;
    if (!org) {
      throw new NotFoundException('Organización no encontrada');
    }

    // 2.1. VALIDAR BALANCE DE CRÉDITOS
    const canExecute = await this.creditsService.canExecuteWorkflow(
      organizationId,
      workflow.category,
    );

    if (!canExecute.allowed) {
      throw new ForbiddenException(`Insufficient credits: ${canExecute.reason}`);
    }

    // 3. CREAR REGISTRO DE EJECUCIÓN
    const execution = await this.executionsService.create(workflowId, trigger, {
      input,
      metadata,
      organizationId: org.id,
      organizationName: org.name,
      userId, // Opcional
      apiKeyId, // Opcional
    });

    this.logger.log(`Iniciando ejecución ${execution.id} para workflow ${workflowId}`);

    // 4. GESTIONAR CONVERSACIÓN
    const channel = metadata?.channel ?? 'api';
    const conversationId = metadata?.conversationId;
    const endUserId = metadata?.endUserId;
    const userMessage = input?.message ?? JSON.stringify(input);

    const conversation = await this.conversationsService.findOrCreateConversation(
      workflowId,
      channel,
      userId,
      endUserId,
      conversationId,
    );

    // Asociar la ejecución a la conversación
    await this.executionsService.linkToConversation(execution.id, conversation.id);

    // VALIDACIÓN IMPORTANTE: Bloquear mensajes internos a externos si HITL está desactivado
    if (userId && conversation.endUserId && !conversation.isHumanInTheLoop) {
      throw new ForbiddenException(
        'Cannot send message to external conversation without Human in the Loop enabled',
      );
    }

    // 4.1 CHECK HITL BYPASS (Internal User acting as AI)
    if (conversation.isHumanInTheLoop && userId) {
      this.logger.log(`HITL Execution: User ${userId} acting as assistant.`);

      // 1. Guardar el mensaje del usuario como 'assistant' (la persona responde por la IA)
      await this.conversationsService.addMessage(conversation.id, 'assistant', userMessage, {
        is_hitl_bypass: true,
        original_user_id: userId,
      });

      // 2. Actualizar ejecución como completada
      await this.executionsService.updateStatus(execution.id, 'completed', {
        result: {
          messages: [{ role: 'assistant', content: userMessage }],
          conversationId: conversation.id,
        },
        cost: 0,
        tokensUsed: 0,
      });

      // 3. Actualizar contadores de conversación
      await this.conversationsService.update(organizationId, conversation.id, {
        messageCount: { increment: 1 },
      });

      return this.executionsService.getByIdFull(execution.id, organizationId);
    }

    // OBTENER HISTORIAL ANTES de guardar el mensaje del usuario
    // Esto evita duplicados en el message_history que enviamos al agente
    const messageHistory = await this.conversationsService.getMessageHistory(conversation.id);

    // GUARDAR MENSAJE DEL USUARIO INMEDIATAMENTE
    await this.conversationsService.addMessage(conversation.id, 'human', userMessage);

    // 5. EJECUTAR WORKFLOW CON EL SERVICIO DE AGENTS
    try {
      // Construir el payload completo con credenciales y configuración
      const payload = await this.buildAgentPayload(
        workflow,
        conversation,
        userMessage,
        userId ?? endUserId,
        channel,
        messageHistory,
      );

      // Llamar al servicio de agents (Python)
      this.logger.debug(`Llamando al AgentsService`);
      const agentResponse = await this.agentsService.execute(payload);

      // 6. GUARDAR SOLO EL ÚLTIMO MENSAJE (RESPUESTA DEL ASISTENTE)
      const messages = agentResponse.messages || [];
      const lastMessage = messages[messages.length - 1]; // Último mensaje = respuesta del asistente
      let assistantMessageSaved = false;

      if (lastMessage?.role === 'assistant') {
        await this.conversationsService.addMessage(
          conversation.id,
          lastMessage.role,
          lastMessage.content,
        );
        assistantMessageSaved = true;

        this.logger.debug(`Guardado mensaje del asistente en conversación ${conversation.id}`);
      } else {
        this.logger.warn(
          `No se encontró mensaje del asistente en ejecución ${execution.id}. ` +
          `Messages: ${JSON.stringify(messages)}`,
        );
      }

      // 7. EXTRAER TOKENS Y CALCULAR COSTO (multi-modelo con BATCH QUERY)
      const metadata = (agentResponse.metadata ?? {}) as any;
      const totalTokens = metadata.total_tokens ?? 0;
      const usageByModel = metadata.usage_by_model ?? {};

      let costUSD = 0;
      const costBreakdown: { model: string; cost: number }[] = [];

      // Si hay usage_by_model, usar batch query (1 query para todos los modelos)
      if (Object.keys(usageByModel).length > 0) {
        try {
          // Convertir formato para batch query
          const usageForBatch: Record<string, any> = {};
          for (const [modelName, usage] of Object.entries(usageByModel)) {
            usageForBatch[modelName] = {
              inputTokens: (usage as { input_tokens?: number })?.input_tokens ?? 0,
              outputTokens: (usage as { output_tokens?: number })?.output_tokens ?? 0,
              totalTokens: (usage as { total_tokens?: number })?.total_tokens ?? 0,
            };
          }

          // BATCH QUERY: Obtener costos de todos los modelos en 1 query
          const calculations = await this.llmModelsService.calculateCostBatch(usageForBatch);

          // Sumar costos
          for (const calc of calculations) {
            costUSD += calc.totalCost;
            costBreakdown.push({ model: calc.model, cost: calc.totalCost });
          }
        } catch (error) {
          this.logger.error(`Error en batch calculation de costos: ${(error as Error).message}`);
        }
      } else {
        // Fallback: usar tokens totales con modelo por defecto
        const inputTokens = metadata.input_tokens ?? 0;
        const outputTokens = metadata.output_tokens ?? 0;
        const modelUsed = metadata.model_used ?? 'gpt-4o-mini';

        if (totalTokens > 0) {
          try {
            const costCalculation = await this.llmModelsService.calculateCost(modelUsed, {
              inputTokens,
              outputTokens,
              totalTokens,
            });
            costUSD = costCalculation.totalCost;
            costBreakdown.push({ model: modelUsed, cost: costUSD });
          } catch (error) {
            this.logger.error(
              `Error calculando costo para modelo ${modelUsed}: ${(error as Error).message}`,
            );
          }
        }
      }

      this.logger.log(
        `Costo total de ejecución ${execution.id}: $${costUSD} ` +
        `(breakdown: ${JSON.stringify(costBreakdown)})`,
      );

      // 8. ACTUALIZAR EXECUTION Y CONVERSATION EN PARALELO
      const messageIncrement = assistantMessageSaved ? 2 : 1; // user + assistant (o solo user)

      // Execution y Conversation son tablas DIFERENTES → Seguro paralelizar
      await Promise.all([
        // Update execution: TODOS los campos en 1 query (evita race condition)
        this.executionsService.updateStatus(execution.id, 'completed', {
          result: {
            ...agentResponse,
            conversationId: conversation.id,
          },
          cost: costUSD,
          tokensUsed: totalTokens, // ← Consolidado en el mismo update
          credits: undefined, // Se actualizará en el siguiente paso
        }),
        // Batch update de conversation (tabla diferente, sin conflicto)
        this.conversationsService.update(organizationId, conversation.id, {
          messageCount: { increment: messageIncrement },
          lastMessageAt: new Date(),
          ...(totalTokens > 0 ? { totalTokens: { increment: totalTokens } } : {}),
          ...(costUSD > 0 ? { totalCost: { increment: Number(costUSD.toFixed(9)) } } : {}),
        }),
      ]);

      this.logger.log(`Ejecución ${execution.id} marcada como completada`);

      // 9. DESCONTAR CRÉDITOS SOLO EN EJECUCIONES EXITOSAS
      // Se descuentan después de confirmar que todo fue exitoso
      const creditsToDeduct = getWorkflowCreditCost(workflow.category);

      await this.creditsService.deductCredits(
        organizationId,
        execution.id,
        workflow.id,
        workflow.category,
        workflow.name,
        costUSD,
        {
          input_tokens: metadata.input_tokens ?? 0,
          output_tokens: metadata.output_tokens ?? 0,
          total_tokens: totalTokens,
          usage_by_model: usageByModel,
          cost_breakdown: costBreakdown,
          execution_time_ms: metadata.execution_time_ms,
        },
      );

      this.logger.log(
        `Créditos descontados para ejecución exitosa ${execution.id}: ` +
        `${creditsToDeduct} créditos (categoría: ${workflow.category}, costo real: $${costUSD.toFixed(4)})`,
      );

      // 10. RETORNAR EJECUCIÓN CON RELACIONES COMPLETAS (requiere query con joins)
      return this.executionsService.getByIdFull(execution.id, organizationId);
    } catch (error) {
      // MANEJAR ERRORES - NO SE DESCONTARÁN CRÉDITOS EN EJECUCIONES FALLIDAS
      this.logger.error(
        `Error en ejecución ${execution.id}: ${(error as Error).message}`,
        (error as Error).stack,
      );

      await this.executionsService.updateStatus(execution.id, 'failed', {
        error: (error as Error).message,
        errorStack: (error as Error).stack,
      });

      this.logger.log(`Ejecución ${execution.id} marcada como fallida. Créditos NO descontados.`);

      throw error;
    }
  }

  //==========================================================
  // Ejecutar Workflow (Streaming)
  //==========================================================
  /**
   * Ejecutar un workflow con streaming
   */
  async executeStream(
    organizationId: string,
    workflowId: string,
    input: Record<string, any>,
    metadata?: Record<string, any>,
    userId?: string, // Opcional: quién ejecuta desde UI
    apiKeyId?: string, // Opcional: qué API key ejecuta
    trigger: 'api' | 'manual' | 'webhook' | 'schedule' = 'api',
  ): Promise<NodeJS.ReadableStream> {
    // 1. VALIDACIONES PREVIAS (Misma lógica que execute)
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId,
        deletedAt: null,
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            plan: true,
          },
        },
        tenantTools: {
          include: {
            credential: true,
            toolCatalog: {
              include: {
                functions: true,
              },
            },
          },
        },
      },
    });

    if (!workflow) {
      throw new WorkflowNotFoundException(workflowId);
    }

    if (!workflow.isActive) {
      throw new InvalidWorkflowConfigException('El workflow está inactivo', {
        workflowId,
        isActive: false,
      });
    }

    if (workflow.isPaused) {
      throw new WorkflowPausedException(workflowId);
    }

    // 2. VALIDAR ORGANIZACIÓN
    const org = workflow.organization;
    if (!org) {
      throw new NotFoundException('Organización no encontrada');
    }

    // 2.1. VALIDAR BALANCE DE CRÉDITOS
    const canExecute = await this.creditsService.canExecuteWorkflow(
      organizationId,
      workflow.category,
    );

    if (!canExecute.allowed) {
      throw new ForbiddenException(`Insufficient credits: ${canExecute.reason}`);
    }

    // 3. CREAR REGISTRO DE EJECUCIÓN
    const execution = await this.executionsService.create(workflowId, trigger, {
      input,
      metadata,
      organizationId: org.id,
      organizationName: org.name,
      userId,
      apiKeyId,
    });

    this.logger.log(`Iniciando ejecución (stream) ${execution.id} para workflow ${workflowId}`);

    // 4. GESTIONAR CONVERSACIÓN
    const channel = metadata?.channel ?? 'api';
    const conversationId = metadata?.conversationId;
    const endUserId = metadata?.endUserId;
    const userMessage = input?.message ?? JSON.stringify(input);

    const conversation = await this.conversationsService.findOrCreateConversation(
      workflowId,
      channel,
      userId,
      endUserId,
      conversationId,
    );

    await this.executionsService.linkToConversation(execution.id, conversation.id);

    // VALIDACIÓN IMPORTANTE: Bloquear mensajes internos a externos si HITL está desactivado
    if (userId && conversation.endUserId && !conversation.isHumanInTheLoop) {
      throw new ForbiddenException(
        'Cannot send message to external conversation without Human in the Loop enabled',
      );
    }

    // 4.1 CHECK HITL BYPASS (Internal User acting as AI)
    if (conversation.isHumanInTheLoop && userId) {
      this.logger.log(`HITL Stream Execution: User ${userId} acting as assistant.`);

      // 1. Guardar el mensaje del usuario como 'assistant'
      await this.conversationsService.addMessage(conversation.id, 'assistant', userMessage, {
        is_hitl_bypass: true,
        original_user_id: userId,
      });

      // 2. Actualizar ejecución
      await this.executionsService.updateStatus(execution.id, 'completed', {
        result: {
          messages: [{ role: 'assistant', content: userMessage }],
          conversationId: conversation.id,
        },
        cost: 0,
        tokensUsed: 0,
      });

      // 3. Actualizar contadores
      await this.conversationsService.update(organizationId, conversation.id, {
        messageCount: { increment: 1 },
      });

      // 4. Retornar stream simulado
      const stream = new PassThrough();
      stream.write(`event: conversation_id\ndata: "${conversation.id}"\n\n`);

      // Simular evento de token para consistencia en frontend
      const tokenEvent = { type: 'token', content: userMessage };
      stream.write(`data: ${JSON.stringify(tokenEvent)}\n\n`);

      // Simular evento finalización (opcional, pero buena práctica)
      // stream.write(`event: done\ndata: "[DONE]"\n\n`);

      stream.end();
      return stream;
    }

    const messageHistory = await this.conversationsService.getMessageHistory(conversation.id);

    await this.conversationsService.addMessage(conversation.id, 'human', userMessage);

    // 5. EJECUTAR STREAM
    try {
      const payload = await this.buildAgentPayload(
        workflow,
        conversation,
        userMessage,
        userId ?? endUserId,
        channel,
        messageHistory,
      );

      this.logger.debug(`Llamando al AgentsService (Stream)`);
      const stream = await this.agentsService.executeStream(payload);

      // 6. FILTRAR Y MONITORIZAR STREAM
      // Devolvemos el stream filtrado al cliente, pero monitorizamos el raw internamente
      return this.handleStreamFilteringAndMonitoring(
        stream,
        execution,
        conversation,
        workflow,
        organizationId,
      );
    } catch (error) {
      this.logger.error(
        `Error iniciando stream ${execution.id}: ${(error as Error).message}`,
        (error as Error).stack,
      );

      await this.executionsService.updateStatus(execution.id, 'failed', {
        error: (error as Error).message,
        errorStack: (error as Error).stack,
      });

      throw error;
    }
  }

  /**
   * Maneja el filtrado del stream para el cliente y la monitorización interna para efectos secundarios
   */
  private handleStreamFilteringAndMonitoring(
    rawStream: NodeJS.ReadableStream,
    execution: any,
    conversation: any,
    workflow: any,
    organizationId: string,
  ): NodeJS.ReadableStream {
    // Stream que enviaremos al cliente (filtrado) on
    const clientStream = new PassThrough();

    // 0. ENVIAR CONVERSATION ID AL INICIO (Evento custom)
    clientStream.write(`event: conversation_id\ndata: "${conversation.id}"\n\n`);

    // let fullContent = '';
    let metadataEvent: any = null;
    let assistantMessageBuilder = '';
    let buffer = '';

    // Transformador para procesar chunks y filtrar
    const transformer = new Transform({
      transform(chunk, encoding, callback) {
        const text = chunk.toString();
        // fullContent += text; // Acumular todo para debug/log
        buffer += text;

        // Procesar buffer por líneas (SSE standard)
        const lines = buffer.split('\n\n');
        // El último elemento puede ser un chunk incompleto
        buffer = lines.pop() ?? '';

        for (const eventBlock of lines) {
          if (!eventBlock.trim().startsWith('data: ')) {
            continue;
          }

          try {
            const jsonStr = eventBlock.replace(/^data: /, '').trim();
            if (!jsonStr) continue;

            const event = JSON.parse(jsonStr);

            // LÓGICA DE FILTRADO Y TRANSFORMACIÓN

            // 1. TOKENS: Simplificar y pasar al cliente + ACUMULAR para guardar
            if (event.type === 'token') {
              // Cliente quiere: data: "El"\n\n
              const simplifiedData = `data: ${JSON.stringify(event.content)}\n\n`;
              this.push(simplifiedData);

              // IMPORTANTE: Acumular también los tokens porque el agente puede NO mandar evento 'message' al final en streaming
              assistantMessageBuilder += event.content ?? '';
            }

            // 2. MENSAJES: Acumular internamente (si el agente manda bloques completos)
            else if (event.type === 'message') {
              // Si ya acumulamos vía tokens, aquí podríamos duplicar si no tenemos cuidado.
              // Asumimos que si manda tokens, NO manda el mensaje completo acumulado, o viceversa.
              // PERO para seguridad: si event.content es TODO el mensaje, deberíamos usar ese.
              // En este caso, simplemente acumulamos si es un chunk tipo mensaje.
              // Si el 'message' event de tu agente es "todo el texto acumulado hasta ahora", entonces deberíamos REEMPLAZAR.
              // Asumimos comportamiento estándar de chunks:
              assistantMessageBuilder += event.content ?? '';
            }

            // 3. TOOLS y METADATA: Se filtran del cliente
            else if (event.type === 'metadata') {
              metadataEvent = event.metadata;
            }
          } catch {
            // Error de parseo json
          }
        }

        callback();
      },
    });

    // Pipeline: Raw -> Transformer -> Client
    rawStream.pipe(transformer).pipe(clientStream);

    // MANEJO DE FIN DE STREAM Y EFECTOS SECUNDARIOS
    transformer.on('finish', () => {
      void (async () => {
        this.logger.log(`Stream finalizado para ejecución ${execution.id}`);

        try {
          // (Ya procesamos el contenido en el transformer, no necesitamos re-parsear fullContent)

          // 2. Procesar finalización
          if (!metadataEvent) {
            this.logger.warn(`No se recibió metadata event en stream ${execution.id}`);
          }

          const usageByModel = metadataEvent?.usage_by_model ?? {};
          const totalTokens = metadataEvent?.total_tokens ?? 0;
          let costUSD = 0;
          const costBreakdown: { model: string; cost: number }[] = [];

          // 3. Calcular Costos
          if (Object.keys(usageByModel).length > 0) {
            const usageForBatch: Record<string, any> = {};
            for (const [modelName, usage] of Object.entries(usageByModel)) {
              usageForBatch[modelName] = {
                inputTokens: (usage as { input_tokens?: number })?.input_tokens ?? 0,
                outputTokens: (usage as { output_tokens?: number })?.output_tokens ?? 0,
                totalTokens: (usage as { total_tokens?: number })?.total_tokens ?? 0,
              };
            }
            try {
              const calculations = await this.llmModelsService.calculateCostBatch(usageForBatch);
              for (const calc of calculations) {
                costUSD += calc.totalCost;
                costBreakdown.push({ model: calc.model, cost: calc.totalCost });
              }
            } catch (e) {
              this.logger.error(`Error calculando costos stream: ${(e as Error).message}`);
            }
          } else {
            // Fallback: usar tokens totales con modelo por defecto
            const inputTokens = metadataEvent?.input_tokens ?? 0;
            const outputTokens = metadataEvent?.output_tokens ?? 0;
            const modelUsed = metadataEvent?.model_used ?? 'gpt-4o-mini';

            if (totalTokens > 0) {
              try {
                const costCalculation = await this.llmModelsService.calculateCost(modelUsed, {
                  inputTokens,
                  outputTokens,
                  totalTokens,
                });
                costUSD = costCalculation.totalCost;
                costBreakdown.push({ model: modelUsed, cost: costUSD });
              } catch (error) {
                this.logger.error(
                  `Error calculando costo stream para modelo ${modelUsed}: ${(error as Error).message}`,
                );
              }
            }
          }

          // 4. Guardar mensaje asistente
          if (assistantMessageBuilder) {
            await this.conversationsService.addMessage(
              conversation.id,
              'assistant',
              assistantMessageBuilder,
            );
          }

          // 5. Actualizar Ejecución
          await this.executionsService.updateStatus(execution.id, 'completed', {
            result: {
              messages: [{ role: 'assistant', content: assistantMessageBuilder }],
              conversationId: conversation.id,
            },
            cost: costUSD,
            tokensUsed: totalTokens,
          });

          // 6. Actualizar Conversación (stats)
          // 6. Actualizar Conversación (stats)
          await this.conversationsService.update(organizationId, conversation.id, {
            messageCount: { increment: assistantMessageBuilder ? 2 : 1 },
            lastMessageAt: new Date(),
            ...(totalTokens > 0 ? { totalTokens: { increment: totalTokens } } : {}),
            ...(costUSD > 0 ? { totalCost: { increment: costUSD } } : {}),
          });

          // 7. Descontar Créditos
          // const creditsToDeduct = getWorkflowCreditCost(workflow.category);
          await this.creditsService.deductCredits(
            organizationId,
            execution.id,
            workflow.id,
            workflow.category,
            workflow.name,
            costUSD,
            {
              input_tokens: metadataEvent?.input_tokens ?? 0,
              output_tokens: metadataEvent?.output_tokens ?? 0,
              total_tokens: totalTokens,
              usage_by_model: usageByModel,
              cost_breakdown: costBreakdown,
              execution_time_ms: metadataEvent?.execution_time_ms ?? 0,
            },
          );

          this.logger.log(
            `Post-stream processing completed for ${execution.id}. Cost: $${costUSD}`,
          );
        } catch (error) {
          this.logger.error(
            `Error en procesamiento post-stream ${execution.id}: ${(error as Error).message}`,
            (error as Error).stack,
          );
          // Intentar marcar como fallido si algo crítico falló después del stream
          await this.executionsService.updateStatus(execution.id, 'failed', {
            error: `Post-stream processing error: ${(error as Error).message}`,
          });
        }
      })();
    });

    return clientStream;
  }

  //==========================================================
  // Metodos Auxiliares
  //==========================================================
  /**
   * Construye el payload completo para el servicio de agents
   *
   * @param workflow - Workflow con todas las relaciones
   * @param conversation - Conversación actual
   * @param userMessage - Mensaje del usuario
   * @param userId - ID del usuario (interno o externo)
   * @param channel - Canal de origen
   * @param messageHistory - Historial de mensajes previo (sin incluir el mensaje actual)
   * @returns Payload listo para enviar al AgentsService
   */
  private async buildAgentPayload(
    workflow: any,
    conversation: any,
    userMessage: string,
    userId?: string,
    channel = 'api',
    messageHistory: any[] = [],
  ) {
    // 1. Extraer nueva estructura unificada de config
    const config = workflow.config;
    const graphConfig = config.graph ?? {
      type: 'react',
      config: { max_iterations: 10, allow_interrupts: false },
    };
    const agentsConfig = config.agents ?? {};

    // 2. Construir tool_instances con UUIDs como keys
    const toolInstances: Record<string, any> = {};

    // Obtener las credenciales descifradas de manera segura
    const credentialsMap = await this.toolsService.populateDecryptedCredentials(workflow.tenantTools);

    for (const tenantTool of workflow.tenantTools) {
      const toolId = tenantTool.id; // UUID del TenantTool
      const toolName = tenantTool.toolCatalog.toolName;

      // Construir instancia completa
      toolInstances[toolId] = {
        tool_name: toolName,
        display_name: tenantTool.displayName,
        config: tenantTool.config ?? {},
        // Priorizar el RBAC a nivel de auth (allowedFunctions)
        enabled_functions: tenantTool.allowedFunctions || tenantTool.toolCatalog.functions.map((fn: any) => fn.functionName),
        credentials: credentialsMap[toolId] || undefined,
      };
    }

    // 3. Filtrar tool_instances por agente según su configuración
    const agentToolInstances: Record<string, Record<string, any>> = {};

    for (const [agentName, agentConfig] of Object.entries(agentsConfig)) {
      const agentTools = (agentConfig as { tools?: any[] }).tools ?? [];
      const filtered: Record<string, any> = {};

      for (const tool of agentTools) {
        if (typeof tool === 'string') {
          // Formato simple: UUID completo sin restricciones
          if (toolInstances[tool]) {
            filtered[tool] = toolInstances[tool];
          }
        } else if (typeof tool === 'object' && tool.id) {
          // Formato granular: {id, functions} - override funciones permitidas
          if (toolInstances[tool.id]) {
            filtered[tool.id] = {
              ...toolInstances[tool.id],
              enabled_functions: tool.functions, // Override con restricciones específicas
            };
          }
        }
      }

      agentToolInstances[agentName] = filtered;

      // Validar: si el agente tiene tools configurados pero ninguno válido
      if (agentTools.length > 0 && Object.keys(filtered).length === 0) {
        this.logger.warn(
          `Agent "${agentName}" tiene tools configurados pero ninguno es válido. ` +
          `Tools configurados: ${JSON.stringify(agentTools)}`,
        );
      }
    }

    // 4. Limpiar agents_config - remover campo 'tools' (redundante, ya está en agent_tool_instances)
    const cleanedAgentsConfig: Record<string, any> = {};
    for (const [agentName, agentConfig] of Object.entries(agentsConfig)) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { tools: _tools, ...configWithoutTools } = agentConfig as any;
      cleanedAgentsConfig[agentName] = configWithoutTools;
    }

    // 5. Determinar tipo de usuario
    const userType = conversation.userId ? UserType.INTERNAL : UserType.EXTERNAL;
    const finalUserId = conversation.userId ?? conversation.endUserId ?? 'anonymous';

    // 6. Construir el payload final
    const payload = {
      // Identificación (OBLIGATORIOS)
      tenant_id: workflow.organizationId,
      workflow_id: workflow.id,
      conversation_id: conversation.id,
      user_type: userType,
      user_id: finalUserId,
      channel,
      user_message: userMessage,

      // Nueva estructura unificada
      graph_config: graphConfig,
      agents_config: cleanedAgentsConfig, // ← Sin campo 'tools'
      agent_tool_instances: agentToolInstances,

      // Historial y metadata
      message_history: messageHistory,
      timezone: workflow.timezone ?? 'UTC',
    };

    // Sanitizar payload para logging (remover credenciales)
    const sanitizedPayload = {
      ...payload,
      agent_tool_instances: Object.fromEntries(
        Object.entries(payload.agent_tool_instances).map(([agentName, tools]) => [
          agentName,
          Object.fromEntries(
            Object.entries(tools).map(([toolId, toolConfig]) => [
              toolId,
              {
                ...toolConfig,
                credentials: toolConfig.credentials ? '[REDACTED]' : undefined,
              },
            ]),
          ),
        ]),
      ),
    };

    this.logger.debug(
      `Payload construido para workflow ${workflow.id}:`,
      JSON.stringify(sanitizedPayload, null, 2),
    );

    return payload;
  }

  /**
   * Valida la estructura del config según su tipo
   */
  private async validateConfig(config: any) {
    if (!config || typeof config !== 'object') {
      throw new InvalidWorkflowConfigException('Config must be an object');
    }

    if (!config.type) {
      throw new InvalidWorkflowConfigException('Config must have a "type" field');
    }

    // Validación para workflows tipo 'agent' (LangGraph)
    if (config.type === 'agent') {
      if (!config.graph?.type) {
        throw new InvalidWorkflowConfigException(
          'Agent workflows must have graph.type (react, supervisor, router, sequential, parallel)',
        );
      }
      if (!config.agents || typeof config.agents !== 'object') {
        throw new InvalidWorkflowConfigException('Agent workflows must have agents config');
      }
      // Validar que al menos exista un agente
      if (Object.keys(config.agents).length === 0) {
        throw new InvalidWorkflowConfigException('Agent workflows must have at least one agent');
      }

      // Validar que los modelos especificados existen en la BD
      await this.validateModelsInConfig(config.agents);
    }
  }

  /**
   * Valida que todos los modelos especificados en agents_config existen en LlmModel
   */
  private async validateModelsInConfig(agentsConfig: Record<string, any>) {
    const modelsToValidate = new Set<string>();

    // Recolectar todos los modelos (principal + fallbacks)
    for (const agentConfig of Object.values(agentsConfig)) {
      if (agentConfig.model) {
        modelsToValidate.add(agentConfig.model);
      }
      if (agentConfig.fallbacks && Array.isArray(agentConfig.fallbacks)) {
        agentConfig.fallbacks.forEach((model: string) => modelsToValidate.add(model));
      }
    }

    if (modelsToValidate.size === 0) {
      throw new InvalidWorkflowConfigException('At least one agent must have a model specified');
    }

    // Obtener modelos activos de la BD
    const activeModels = await this.prisma.llmModel.findMany({
      where: { isActive: true },
      select: { modelName: true },
    });

    const activeModelNames = new Set(activeModels.map((m) => m.modelName));
    const invalidModels: string[] = [];

    // Verificar que cada modelo existe
    for (const model of modelsToValidate) {
      if (!activeModelNames.has(model)) {
        invalidModels.push(model);
      }
    }

    if (invalidModels.length > 0) {
      const availableModels = Array.from(activeModelNames).slice(0, 10).join(', ');
      throw new InvalidWorkflowConfigException(
        `Invalid models: ${invalidModels.join(', ')}. ` +
        `Available models: ${availableModels}${activeModelNames.size > 10 ? '...' : ''}`,
      );
    }
  }
}
