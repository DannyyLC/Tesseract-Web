import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Transform, PassThrough } from 'stream';
import { PrismaService } from '../database/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { ExecutionsService } from '../executions/executions.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AgentsService } from '../agents/agents.service';
import { UserType } from '../agents/dto/agent-execution-request.dto';
import {
  PLANS,
  SubscriptionPlan,
  getWorkflowCreditCost,
} from '@workflow-automation/shared-types';
import { CreditsService } from '../credits/credits.service';
import { LlmModelsService } from '../llm-models/llm-models.service';
import { ConversationsService } from '../conversations/conversations.service';
import {
  WorkflowNotFoundException,
  WorkflowPausedException,
  InvalidWorkflowConfigException,
} from '../common/exceptions';

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
  ) {}

  //==========================================================
  // CRUD DE WORKFLOWS
  //==========================================================
  /**
   * Crear un nuevo workflow
   */
  async create(organizationId: string, dto: CreateWorkflowDto) {
    await this.validateConfig(dto.config);

    // Validar límite de workflows según el plan
    const canAdd =
      await this.organizationsService.canAddWorkflow(organizationId);
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

    this.logger.log(
      `Workflow creado ${workflow.id} en organización ${organizationId}`,
    );
    return workflow;
  }

  /**
   * Listar workflows de la organización
   */
  async findAll(organizationId: string, includeDeleted: boolean = false) {
    return this.prisma.workflow.findMany({
      where: {
        organizationId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      include: {
        tags: true,
        _count: {
          select: {
            executions: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Obtener un workflow específico
   */
  async findOne(organizationId: string, workflowId: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: {
        id: workflowId,
        organizationId,
        deletedAt: null,
      },
      include: {
        tags: true,
        executions: {
          take: 10,
          orderBy: { startedAt: 'desc' },
        },
      },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow no encontrado');
    }

    return workflow;
  }

  /**
   * Actualizar un workflow
   */
  async update(
    organizationId: string,
    workflowId: string,
    dto: UpdateWorkflowDto,
  ) {
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

    this.logger.log(
      `Workflow actualizado: ${workflowId} (versión ${workflow.version})`,
    );
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
      throw new ForbiddenException(
        `Insufficient credits: ${canExecute.reason}`,
      );
    }

    // 3. CREAR REGISTRO DE EJECUCIÓN
    const execution = await this.executionsService.create(workflowId, 'api', {
      input,
      metadata,
      organizationId: org.id,
      organizationName: org.name,
      userId, // Opcional
      apiKeyId, // Opcional
    });

    this.logger.log(
      `Iniciando ejecución ${execution.id} para workflow ${workflowId}`,
    );

    // 4. GESTIONAR CONVERSACIÓN
    const channel = metadata?.channel || 'api';
    const conversationId = metadata?.conversationId;
    const endUserId = metadata?.endUserId;
    const userMessage = input?.message || JSON.stringify(input);

    const conversation =
      await this.conversationsService.findOrCreateConversation(
        workflowId,
        channel,
        userId,
        endUserId,
        conversationId,
      );

    // Asociar la ejecución a la conversación
    await this.executionsService.linkToConversation(
      execution.id,
      conversation.id,
    );

    // OBTENER HISTORIAL ANTES de guardar el mensaje del usuario
    // Esto evita duplicados en el message_history que enviamos al agente
    const messageHistory = await this.conversationsService.getMessageHistory(
      conversation.id,
    );

    // GUARDAR MENSAJE DEL USUARIO INMEDIATAMENTE
    await this.conversationsService.addMessage(
      conversation.id,
      'human',
      userMessage,
    );

    // 5. EJECUTAR WORKFLOW CON EL SERVICIO DE AGENTS
    try {
      // Construir el payload completo con credenciales y configuración
      const payload = await this.buildAgentPayload(
        workflow,
        conversation,
        userMessage,
        userId || endUserId,
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

      if (lastMessage && lastMessage.role === 'assistant') {
        await this.conversationsService.addMessage(
          conversation.id,
          lastMessage.role,
          lastMessage.content,
        );
        assistantMessageSaved = true;

        this.logger.debug(
          `Guardado mensaje del asistente en conversación ${conversation.id}`,
        );
      } else {
        this.logger.warn(
          `No se encontró mensaje del asistente en ejecución ${execution.id}. ` +
            `Messages: ${JSON.stringify(messages)}`,
        );
      }

      // 7. EXTRAER TOKENS Y CALCULAR COSTO (multi-modelo con BATCH QUERY)
      const metadata = (agentResponse.metadata || {}) as any;
      const totalTokens = metadata.total_tokens || 0;
      const usageByModel = metadata.usage_by_model || {};

      let costUSD = 0;
      const costBreakdown: { model: string; cost: number }[] = [];

      // Si hay usage_by_model, usar batch query (1 query para todos los modelos)
      if (Object.keys(usageByModel).length > 0) {
        try {
          // Convertir formato para batch query
          const usageForBatch: Record<string, any> = {};
          for (const [modelName, usage] of Object.entries(usageByModel)) {
            usageForBatch[modelName] = {
              inputTokens: usage.input_tokens || 0,
              outputTokens: usage.output_tokens || 0,
              totalTokens: usage.total_tokens || 0,
            };
          }

          // BATCH QUERY: Obtener costos de todos los modelos en 1 query
          const calculations =
            await this.llmModelsService.calculateCostBatch(usageForBatch);

          // Sumar costos
          for (const calc of calculations) {
            costUSD += calc.totalCost;
            costBreakdown.push({ model: calc.model, cost: calc.totalCost });
          }
        } catch (error) {
          this.logger.error(
            `Error en batch calculation de costos: ${(error as Error).message}`,
          );
        }
      } else {
        // Fallback: usar tokens totales con modelo por defecto
        const inputTokens = metadata.input_tokens || 0;
        const outputTokens = metadata.output_tokens || 0;
        const modelUsed = metadata.model_used || 'gpt-4o-mini';

        if (totalTokens > 0) {
          try {
            const costCalculation = await this.llmModelsService.calculateCost(
              modelUsed,
              { inputTokens, outputTokens, totalTokens },
            );
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
        this.conversationsService.batchUpdate(
          conversation.id,
          messageIncrement,
          totalTokens,
          costUSD,
        ),
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
          input_tokens: metadata.input_tokens || 0,
          output_tokens: metadata.output_tokens || 0,
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
      return this.executionsService.findOneForClient(
        execution.id,
        organizationId,
      );
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

      this.logger.log(
        `Ejecución ${execution.id} marcada como fallida. Créditos NO descontados.`,
      );

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
      throw new ForbiddenException(
        `Insufficient credits: ${canExecute.reason}`,
      );
    }

    // 3. CREAR REGISTRO DE EJECUCIÓN
    const execution = await this.executionsService.create(workflowId, 'api', {
      input,
      metadata,
      organizationId: org.id,
      organizationName: org.name,
      userId,
      apiKeyId,
    });

    this.logger.log(
      `Iniciando ejecución (stream) ${execution.id} para workflow ${workflowId}`,
    );

    // 4. GESTIONAR CONVERSACIÓN
    const channel = metadata?.channel || 'api';
    const conversationId = metadata?.conversationId;
    const endUserId = metadata?.endUserId;
    const userMessage = input?.message || JSON.stringify(input);

    const conversation =
      await this.conversationsService.findOrCreateConversation(
        workflowId,
        channel,
        userId,
        endUserId,
        conversationId,
      );

    await this.executionsService.linkToConversation(
      execution.id,
      conversation.id,
    );

    const messageHistory = await this.conversationsService.getMessageHistory(
      conversation.id,
    );

    await this.conversationsService.addMessage(
      conversation.id,
      'human',
      userMessage,
    );

    // 5. EJECUTAR STREAM
    try {
      const payload = await this.buildAgentPayload(
        workflow,
        conversation,
        userMessage,
        userId || endUserId,
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

    let fullContent = '';
    let metadataEvent: any = null;
    let assistantMessageBuilder = '';
    let buffer = '';

    // Transformador para procesar chunks y filtrar
    const transformer = new Transform({
      transform(chunk, encoding, callback) {
        const text = chunk.toString();
        fullContent += text; // Acumular todo para debug/log
        buffer += text;

        // Procesar buffer por líneas (SSE standard)
        const lines = buffer.split('\n\n');
        // El último elemento puede ser un chunk incompleto
        buffer = lines.pop() || '';

        for (const eventBlock of lines) {
          if (!eventBlock.trim().startsWith('data: ')) {
            continue;
          }

          try {
            const jsonStr = eventBlock.replace(/^data: /, '').trim();
            if (!jsonStr) continue;

            const event = JSON.parse(jsonStr);

            // LÓGICA DE FILTRADO Y TRANSFORMACIÓN

            // 1. TOKENS: Simplificar y pasar al cliente
            if (event.type === 'token') {
              // Cliente quiere: data: "El"\n\n
              const simplifiedData = `data: ${JSON.stringify(event.content)}\n\n`;
              this.push(simplifiedData);
            }

            // 2. MENSAJES: Acumular internamente
            else if (event.type === 'message') {
              assistantMessageBuilder += event.content || '';
            }

            // 3. TOOLS y METADATA: Se filtran del cliente
            else if (event.type === 'metadata') {
              metadataEvent = event.metadata;
            }
          } catch (e) {
            // Error de parseo json
          }
        }

        callback();
      },
    });

    // Pipeline: Raw -> Transformer -> Client
    rawStream.pipe(transformer).pipe(clientStream);

    // MANEJO DE FIN DE STREAM Y EFECTOS SECUNDARIOS
    transformer.on('finish', async () => {
      this.logger.log(`Stream finalizado para ejecución ${execution.id}`);

      try {
        // (Ya procesamos el contenido en el transformer, no necesitamos re-parsear fullContent)

        // 2. Procesar finalización
        if (!metadataEvent) {
          this.logger.warn(
            `No se recibió metadata event en stream ${execution.id}`,
          );
        }

        const usageByModel = metadataEvent?.usage_by_model || {};
        const totalTokens = metadataEvent?.total_tokens || 0;
        let costUSD = 0;
        const costBreakdown: { model: string; cost: number }[] = [];

        // 3. Calcular Costos
        if (Object.keys(usageByModel).length > 0) {
          const usageForBatch: Record<string, any> = {};
          for (const [modelName, usage] of Object.entries(usageByModel)) {
            usageForBatch[modelName] = {
              inputTokens: usage.input_tokens || 0,
              outputTokens: usage.output_tokens || 0,
              totalTokens: usage.total_tokens || 0,
            };
          }
          try {
            const calculations =
              await this.llmModelsService.calculateCostBatch(usageForBatch);
            for (const calc of calculations) {
              costUSD += calc.totalCost;
              costBreakdown.push({ model: calc.model, cost: calc.totalCost });
            }
          } catch (e) {
            this.logger.error(`Error calculando costos stream: ${e}`);
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
        await this.conversationsService.batchUpdate(
          conversation.id,
          assistantMessageBuilder ? 2 : 1,
          totalTokens,
          costUSD,
        );

        // 7. Descontar Créditos
        const creditsToDeduct = getWorkflowCreditCost(workflow.category);
        await this.creditsService.deductCredits(
          organizationId,
          execution.id,
          workflow.id,
          workflow.category,
          workflow.name,
          costUSD,
          {
            input_tokens: metadataEvent?.input_tokens || 0,
            output_tokens: metadataEvent?.output_tokens || 0,
            total_tokens: totalTokens,
            usage_by_model: usageByModel,
            cost_breakdown: costBreakdown,
            execution_time_ms: metadataEvent?.execution_time_ms || 0,
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
    channel: string = 'api',
    messageHistory: any[] = [],
  ) {
    // 1. Extraer nueva estructura unificada de config
    const config = workflow.config;
    const graphConfig = config.graph || {
      type: 'react',
      config: { max_iterations: 10, allow_interrupts: false },
    };
    const agentsConfig = config.agents || {};

    // 2. Construir tool_instances con UUIDs como keys
    const toolInstances: Record<string, any> = {};

    for (const tenantTool of workflow.tenantTools) {
      const toolId = tenantTool.id; // UUID del TenantTool
      const toolName = tenantTool.toolCatalog.toolName;

      // Construir instancia completa
      toolInstances[toolId] = {
        tool_name: toolName,
        display_name: tenantTool.displayName,
        config: tenantTool.config || {},
        enabled_functions: tenantTool.toolCatalog.functions.map(
          (fn: any) => fn.functionName,
        ),
      };

      // TODO: Agregar credenciales cuando se implemente
      // if (tenantTool.credentialPath) { ... }
    }

    // 3. Filtrar tool_instances por agente según su configuración
    const agentToolInstances: Record<string, Record<string, any>> = {};

    for (const [agentName, agentConfig] of Object.entries(agentsConfig)) {
      const agentTools = agentConfig.tools || [];
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
      const { tools, ...configWithoutTools } = agentConfig;
      cleanedAgentsConfig[agentName] = configWithoutTools;
    }

    // 5. Determinar tipo de usuario
    const userType = conversation.userId
      ? UserType.INTERNAL
      : UserType.EXTERNAL;
    const finalUserId =
      conversation.userId || conversation.endUserId || 'anonymous';

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
      timezone: workflow.timezone || 'UTC',
    };

    // Sanitizar payload para logging (remover credenciales)
    const sanitizedPayload = {
      ...payload,
      agent_tool_instances: Object.fromEntries(
        Object.entries(payload.agent_tool_instances).map(
          ([agentName, tools]) => [
            agentName,
            Object.fromEntries(
              Object.entries(tools).map(([toolId, toolConfig]) => [
                toolId,
                {
                  ...toolConfig,
                  credentials: toolConfig.credentials
                    ? '[REDACTED]'
                    : undefined,
                },
              ]),
            ),
          ],
        ),
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
      throw new InvalidWorkflowConfigException(
        'Config must have a "type" field',
      );
    }

    // Validación para workflows tipo 'agent' (LangGraph)
    if (config.type === 'agent') {
      if (!config.graph?.type) {
        throw new InvalidWorkflowConfigException(
          'Agent workflows must have graph.type (react, supervisor, router, sequential, parallel)',
        );
      }
      if (!config.agents || typeof config.agents !== 'object') {
        throw new InvalidWorkflowConfigException(
          'Agent workflows must have agents config',
        );
      }
      // Validar que al menos exista un agente
      if (Object.keys(config.agents).length === 0) {
        throw new InvalidWorkflowConfigException(
          'Agent workflows must have at least one agent',
        );
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
        agentConfig.fallbacks.forEach((model: string) =>
          modelsToValidate.add(model),
        );
      }
    }

    if (modelsToValidate.size === 0) {
      throw new InvalidWorkflowConfigException(
        'At least one agent must have a model specified',
      );
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
      const availableModels = Array.from(activeModelNames)
        .slice(0, 10)
        .join(', ');
      throw new InvalidWorkflowConfigException(
        `Invalid models: ${invalidModels.join(', ')}. ` +
          `Available models: ${availableModels}${activeModelNames.size > 10 ? '...' : ''}`,
      );
    }
  }
}
