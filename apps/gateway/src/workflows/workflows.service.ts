import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
    Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { ExecutionsService } from '../executions/executions.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { SecretsService } from '../secrets/secrets.service';
import { AgentsService } from '../agents/agents.service';
import { UserType } from '../agents/dto/agent-execution-request.dto';
import { PLANS, SubscriptionPlan } from '@workflow-automation/shared-types';
import { CreditBalanceService } from '../credits/credit-balance.service';
import { ModelPricesService } from '../model-prices/model-prices.service';
import {
  WorkflowNotFoundException,
  WorkflowPausedException,
  InvalidWorkflowConfigException,
  MaxExecutionsExceededException,
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
        private readonly secretsService: SecretsService,
        private readonly agentsService: AgentsService,
        private readonly creditBalanceService: CreditBalanceService,
        private readonly modelPricesService: ModelPricesService,
    ) {}

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
                isActive: false, // También desactivarlo
            },
        });

        this.logger.log(`Workflow eliminado: ${workflowId}`);
        return { message: 'Workflow eliminado exitosamente', workflow };
    }

    /**
     * EJECUTAR UN WORKFLOW
     * Puede ser llamado desde UI (user) o desde API externa (API key)
     */
    async execute(
        organizationId: string,
        workflowId: string,
        input: Record<string, any>,
        metadata?: Record<string, any>,
        userId?: string, // Opcional: quién ejecuta desde UI
        apiKeyId?: string, // Opcional: qué API key ejecuta
    ) {
        // 1. VALIDACIONES PREVIAS
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
        const canExecute = await this.creditBalanceService.canExecuteWorkflow(
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

        const conversation = await this.findOrCreateConversation(
            workflowId,
            channel,
            userId,
            endUserId,
            conversationId,
        );

        // Asociar la ejecución a la conversación
        await this.prisma.execution.update({
            where: { id: execution.id },
            data: { conversationId: conversation.id },
        });

        // OBTENER HISTORIAL ANTES de guardar el mensaje del usuario
        // Esto evita duplicados en el message_history que enviamos al agente
        const messageHistory = await this.prisma.message.findMany({
            where: { conversationId: conversation.id },
            orderBy: { createdAt: 'asc' },
            select: {
                role: true,
                content: true,
            },
        });

        // GUARDAR MENSAJE DEL USUARIO INMEDIATAMENTE
        await this.prisma.message.create({
            data: {
                conversationId: conversation.id,
                role: 'human',
                content: userMessage,
            },
        });

        // Actualizar contador de mensajes de la conversación
        await this.prisma.conversation.update({
            where: { id: conversation.id },
            data: {
                messageCount: { increment: 1 },
                lastMessageAt: new Date(),
            },
        });

        // 5. OBTENER WORKFLOW CON RELACIONES PARA EL PAYLOAD
        const workflowWithTools = await this.prisma.workflow.findUnique({
            where: { id: workflowId },
            include: {
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

        if (!workflowWithTools) {
            throw new WorkflowNotFoundException(workflowId);
        }

        // 6. EJECUTAR WORKFLOW CON EL SERVICIO DE AGENTS
        try {
            // Construir el payload completo con credenciales y configuración
            const payload = await this.buildAgentPayload(
                workflowWithTools,
                conversation,
                userMessage,
                userId || endUserId,
                channel,
                messageHistory,
            );

            // Llamar al servicio de agents (Python)
            this.logger.debug(
                `Llamando al AgentsService`,
            );
            const agentResponse = await this.agentsService.execute(payload);

            // 7. GUARDAR SOLO EL ÚLTIMO MENSAJE (RESPUESTA DEL ASISTENTE)
            const messages = agentResponse.messages || [];
            const lastMessage = messages[messages.length - 1]; // Último mensaje = respuesta del asistente
            
            if (lastMessage && lastMessage.role === 'assistant') {
                await this.prisma.message.create({
                    data: {
                        conversationId: conversation.id,
                        role: lastMessage.role,
                        content: lastMessage.content,
                    },
                });
                
                // Actualizar estadísticas de la conversación
                await this.prisma.conversation.update({
                    where: { id: conversation.id },
                    data: {
                        messageCount: { increment: 1 },
                        lastMessageAt: new Date(),
                    },
                });
                
                this.logger.debug(
                    `Guardado mensaje del asistente en conversación ${conversation.id}`,
                );
            }

            // 8.1. EXTRAER TOKENS Y CALCULAR COSTO (multi-modelo)
            const metadata = (agentResponse.metadata || {}) as any;
            const totalTokens = metadata.total_tokens || 0;
            const usageByModel = metadata.usage_by_model || {};

            // Calcular costo en USD sumando todos los modelos usados
            let costUSD = 0;
            const costBreakdown: { model: string; cost: number }[] = [];

            // Si hay usage_by_model, calcular costo por cada modelo
            if (Object.keys(usageByModel).length > 0) {
                for (const [modelName, usage] of Object.entries(usageByModel) as [string, any][]) {
                    try {
                        const costCalculation = await this.modelPricesService.calculateCost(
                            modelName,
                            {
                                inputTokens: usage.input_tokens || 0,
                                outputTokens: usage.output_tokens || 0,
                                totalTokens: usage.total_tokens || 0,
                            },
                        );
                        costUSD += costCalculation.totalCost;
                        costBreakdown.push({ model: modelName, cost: costCalculation.totalCost });
                        
                        this.logger.debug(
                            `Costo para modelo ${modelName}: $${costCalculation.totalCost} ` +
                            `(input: ${usage.input_tokens}, output: ${usage.output_tokens})`,
                        );
                    } catch (error) {
                        this.logger.error(
                            `Error calculando costo para modelo ${modelName}: ${(error as Error).message}`,
                        );
                    }
                }
            } else {
                // Fallback: usar tokens totales con modelo por defecto
                const inputTokens = metadata.input_tokens || 0;
                const outputTokens = metadata.output_tokens || 0;
                const modelUsed = metadata.model_used || 'gpt-4o-mini';
                
                if (totalTokens > 0) {
                    try {
                        const costCalculation = await this.modelPricesService.calculateCost(
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

            // 8.2. DESCONTAR CRÉDITOS DEL BALANCE
            await this.creditBalanceService.deductCredits(
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
                `Créditos descontados para ejecución ${execution.id}`,
            );

            // 8.3. ACTUALIZAR EXECUTION CON TOKENS Y COSTO
            await this.prisma.execution.update({
                where: { id: execution.id },
                data: {
                    tokensUsed: totalTokens,
                    cost: costUSD,
                },
            });

            // 8.4. ACTUALIZAR CONVERSATION ACUMULANDO TOKENS Y COSTOS
            await this.prisma.conversation.update({
                where: { id: conversation.id },
                data: {
                    totalTokens: { increment: totalTokens },
                    totalCost: { increment: costUSD },
                },
            });

            // 9. MARCAR EJECUCIÓN COMO COMPLETADA
            await this.executionsService.updateStatus(execution.id, 'completed', {
                result: {
                    ...agentResponse,
                    conversationId: conversation.id,
                },
            });

            this.logger.log(`Ejecución ${execution.id} completada exitosamente`);

            return this.executionsService.findOne(execution.id, organizationId);
        } catch (error) {
            // 9. MANEJAR ERRORES
            this.logger.error(
                `Error en ejecución ${execution.id}: ${(error as Error).message}`,
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
     * Busca o crea una conversación para la ejecución
     * 
     * @param workflowId - ID del workflow
     * @param channel - Canal de comunicación (api, whatsapp, web, dashboard)
     * @param userId - ID del usuario interno (opcional)
     * @param endUserId - ID del usuario externo (opcional)
     * @param conversationId - ID de conversación existente (opcional)
     * @returns Conversación existente o nueva
     */
    private async findOrCreateConversation(
        workflowId: string,
        channel: string,
        userId?: string,
        endUserId?: string,
        conversationId?: string,
    ) {
        // Si viene un conversationId, buscar esa conversación
        if (conversationId) {
            const existing = await this.prisma.conversation.findUnique({
                where: { id: conversationId },
            });

            if (existing) {
                this.logger.debug(`Usando conversación existente: ${conversationId}`);
                return existing;
            }
        }

        // Si no existe o no viene conversationId, crear una nueva
        const newConversation = await this.prisma.conversation.create({
            data: {
                workflowId,
                channel,
                userId,
                endUserId,
                status: 'active',
                messageCount: 0,
                totalTokens: 0,
                totalCost: 0,
            },
        });

        this.logger.log(`Nueva conversación creada: ${newConversation.id}`);
        return newConversation;
    }



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
        const config = workflow.config as any;
        const graphConfig = config.graph || { 
            type: 'react', 
            config: { max_iterations: 10, allow_interrupts: false } 
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

            // Agregar credenciales si existen
            if (tenantTool.credentialPath) {
                const creds = await this.secretsService.getCredentials(
                    tenantTool.credentialPath,
                );
                toolInstances[toolId].credentials = creds;
            }
        }

        // 3. Filtrar tool_instances por agente según su configuración
        const agentToolInstances: Record<string, Record<string, any>> = {};

        for (const [agentName, agentConfig] of Object.entries(agentsConfig) as [string, any][]) {
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
        for (const [agentName, agentConfig] of Object.entries(agentsConfig) as [string, any][]) {
            const { tools, ...configWithoutTools } = agentConfig;
            cleanedAgentsConfig[agentName] = configWithoutTools;
        }

        // 5. Determinar tipo de usuario
        const userType = conversation.userId ? UserType.INTERNAL : UserType.EXTERNAL;
        const finalUserId = conversation.userId || conversation.endUserId || 'anonymous';

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
                Object.entries(payload.agent_tool_instances).map(([agentName, tools]) => [
                    agentName,
                    Object.fromEntries(
                        Object.entries(tools as Record<string, any>).map(([toolId, toolConfig]) => [
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
     * Valida que todos los modelos especificados en agents_config existen en ModelPrice
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
            throw new InvalidWorkflowConfigException(
                'At least one agent must have a model specified'
            );
        }

        // Obtener modelos activos de la BD
        const activeModels = await this.prisma.modelPrice.findMany({
            where: { isActive: true },
            select: { modelName: true },
        });

        const activeModelNames = new Set(activeModels.map(m => m.modelName));
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
                `Available models: ${availableModels}${activeModelNames.size > 10 ? '...' : ''}`
            );
        }
    }    
}
    
