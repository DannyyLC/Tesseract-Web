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
import { PLANS, PlanType } from '@workflow-automation/shared-types';
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
    ) {}

    /**
     * Crear un nuevo workflow
     */
    async create(organizationId: string, dto: CreateWorkflowDto) {
        this.validateConfig(dto.config);

        // Validar límite de workflows según el plan
        const canAdd = await this.organizationsService.canAddWorkflow(organizationId);
        if (!canAdd) {
            const org = await this.prisma.organization.findUnique({
                where: { id: organizationId },
                select: { plan: true },
            });
            const limit = PLANS[org!.plan as PlanType].limits.maxWorkflows;
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
            this.validateConfig(dto.config);
        }

        // 3. Actualizar (incrementando versión)
        const workflow = await this.prisma.workflow.update({
            where: { id: workflowId },
            data: {
                name: dto.name,
                description: dto.description,
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

        // 2. VALIDAR LÍMITES DIARIOS DE EJECUCIÓN
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const executionsToday = await this.prisma.execution.count({
            where: {
                workflow: {
                    organizationId,
                },
                startedAt: {
                    gte: today,
                },
            },
        });

        const org = workflow.organization;
        if (!org) {
            throw new NotFoundException('Organización no encontrada');
        }

        // TODO: Agregar límites de ejecuciones al plan si es necesario
        // const maxExecutionsPerDay = PLANS[org.plan].limits.maxExecutionsPerDay;
        // if (maxExecutionsPerDay !== -1 && executionsToday >= maxExecutionsPerDay) {
        //     throw new MaxExecutionsExceededException(executionsToday, maxExecutionsPerDay);
        // }

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
            );

            // Llamar al servicio de agents (Python)
            this.logger.debug(`Llamando al AgentsService con payload...`);
            const agentResponse = await this.agentsService.execute(payload);

            // 7. GUARDAR MENSAJES RETORNADOS
            const messages = agentResponse.messages || [];
            const savedMessages = await this.saveMessages(conversation.id, messages);

            // 8. ACTUALIZAR ESTADÍSTICAS DE LA CONVERSACIÓN
            await this.updateConversationStats(conversation.id, savedMessages);

            // 9. MARCAR EJECUCIÓN COMO COMPLETADA
            await this.executionsService.updateStatus(execution.id, 'completed', {
                result: {
                    ...agentResponse,
                    conversationId: conversation.id,
                    messagesCount: messages.length,
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
     * Guarda los mensajes retornados por el servicio de agents
     * 
     * @param conversationId - ID de la conversación
     * @param messages - Array de mensajes del agente
     * @returns Array de mensajes guardados
     */
    private async saveMessages(conversationId: string, messages: any[]) {
        const savedMessages = [];

        for (const msg of messages) {
            const message = await this.prisma.message.create({
                data: {
                    conversationId,
                    role: msg.role,
                    content: msg.content,
                    attachments: msg.attachments || null,
                    metadata: msg.metadata || null,
                    model: msg.model || null,
                    tokens: msg.tokens || null,
                    cost: msg.cost || null,
                    latencyMs: msg.latencyMs || null,
                    toolCalls: msg.toolCalls || null,
                    toolResults: msg.toolResults || null,
                },
            });

            savedMessages.push(message);
        }

        this.logger.debug(
            `Guardados ${savedMessages.length} mensajes en conversación ${conversationId}`,
        );

        return savedMessages;
    }

    /**
     * Actualiza las estadísticas de la conversación
     * 
     * @param conversationId - ID de la conversación
     * @param messages - Array de mensajes recién guardados
     */
    private async updateConversationStats(
        conversationId: string,
        messages: any[],
    ) {
        // Calcular totales de los nuevos mensajes
        const newMessageCount = messages.length;
        const newTotalTokens = messages.reduce(
            (sum, msg) => sum + (msg.tokens || 0),
            0,
        );
        const newTotalCost = messages.reduce(
            (sum, msg) => sum + (msg.cost || 0),
            0,
        );

        // Actualizar conversación incrementando los contadores
        await this.prisma.conversation.update({
            where: { id: conversationId },
            data: {
                messageCount: { increment: newMessageCount },
                totalTokens: { increment: newTotalTokens },
                totalCost: { increment: newTotalCost },
                lastMessageAt: new Date(),
            },
        });

        this.logger.debug(
            `Estadísticas actualizadas - Conversación ${conversationId}: +${newMessageCount} msgs, +${newTotalTokens} tokens, +$${newTotalCost.toFixed(4)}`,
        );
    }

    /**
     * Construye el payload completo para el servicio de agents
     * 
     * @param workflow - Workflow con todas las relaciones
     * @param conversation - Conversación actual
     * @param userMessage - Mensaje del usuario
     * @param userId - ID del usuario (interno o externo)
     * @param channel - Canal de origen
     * @returns Payload listo para enviar al AgentsService
     */
    private async buildAgentPayload(
        workflow: any,
        conversation: any,
        userMessage: string,
        userId?: string,
        channel: string = 'api',
    ) {
        // 1. Extraer configuración del agente y modelos desde el config
        const config = workflow.config as any;
        const agentConfig = config.agent || {
            graph_type: 'react',
            max_iterations: 10,
            allow_interrupts: false,
        };
        const modelsConfig = config.models || {};

        // 2. Construir enabled_tools (lista de nombres de catálogo)
        const enabledTools: string[] = [];
        const credentials: Record<string, any> = {};
        const toolConfigs: Record<string, any> = {};
        const enabledFunctions: Record<string, string[]> = {};

        // Procesar cada TenantTool asociado al workflow
        for (const tenantTool of workflow.tenantTools) {
            const toolName = tenantTool.toolCatalog.toolName; // Nombre en el catálogo (ej: "calculator")
            const toolId = tenantTool.id; // ID único del TenantTool

            // Agregar al array de enabled_tools
            if (!enabledTools.includes(toolName)) {
                enabledTools.push(toolName);
            }

            // Obtener credenciales desde Secret Manager (si tiene)
            if (tenantTool.credentialPath) {
                const creds = await this.secretsService.getCredentials(
                    tenantTool.credentialPath,
                );
                credentials[toolName] = creds;
            }

            // Agregar configuración específica de la tool
            if (tenantTool.config) {
                toolConfigs[toolName] = tenantTool.config;
            }

            // Determinar funciones habilitadas para esta tool
            const toolPermissions = workflow.toolPermissions as any;
            if (toolPermissions && toolPermissions[toolId]) {
                // Si hay permisos específicos definidos, usar esos
                enabledFunctions[toolName] = toolPermissions[toolId];
            } else {
                // Si no hay permisos específicos, usar TODAS las funciones del catálogo
                enabledFunctions[toolName] = tenantTool.toolCatalog.functions.map(
                    (fn: any) => fn.functionName,
                );
            }
        }

        // 3. Obtener historial de mensajes de la conversación
        let messageHistory: any[] = [];
        if (conversation.id) {
            const messages = await this.prisma.message.findMany({
                where: { conversationId: conversation.id },
                orderBy: { createdAt: 'asc' },
                select: {
                    role: true,
                    content: true,
                },
            });
            messageHistory = messages;
        }

        // 4. Determinar tipo de usuario
        const userType = conversation.userId ? UserType.INTERNAL : UserType.EXTERNAL;
        const finalUserId = conversation.userId || conversation.endUserId || 'anonymous';

        // 5. Construir el payload final según el DTO esperado
        const payload = {
            // Identificación (OBLIGATORIOS)
            tenant_id: workflow.organizationId,
            workflow_id: workflow.id,
            conversation_id: conversation.id,
            user_type: userType,
            user_id: finalUserId,
            channel,
            user_message: userMessage,

            // Configuración del agente
            enabled_tools: enabledTools,
            agent_config: agentConfig,
            model_configs: modelsConfig,

            // Credenciales y configs de tools (OPCIONALES)
            credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
            tool_configs: Object.keys(toolConfigs).length > 0 ? toolConfigs : undefined,
            enabled_functions: Object.keys(enabledFunctions).length > 0 ? enabledFunctions : undefined,

            // Historial y metadata
            message_history: messageHistory,
            timezone: workflow.timezone || 'UTC',
        };

        this.logger.debug(
            `Payload construido para workflow ${workflow.id}:`,
            JSON.stringify(payload, null, 2),
        );

        return payload;
    }

    /**
    * Valida la estructura del config según su tipo
    */
    private validateConfig(config: any) {
        if (!config.type) {
            throw new BadRequestException('El config debe tener un campo "type"');
        }

        // TODO: Implementar validación según el tipo de workflow que se integre con Python agents
    }    
}
