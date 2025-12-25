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
                triggerType: dto.triggerType,
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
                ...dto,
                config: dto.config as any,
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

        // 4. EJECUTAR WORKFLOW
        // TODO: Implementar integración con el servicio de agents de Python
        try {
            const config = workflow.config as any;

            if (!config.type) {
                throw new InvalidWorkflowConfigException(
                    'El config debe tener un campo "type"',
                );
            }

            // TODO: Implementar ejecución de workflows
            throw new Error('La ejecución de workflows aún no está implementada');

            // 5. MARCAR COMO COMPLETADA
            // await this.executionsService.updateStatus(execution.id, 'completed', {
                result,
            });

            this.logger.log(`Ejecución ${execution.id} completada exitosamente`);

            return this.executionsService.findOne(execution.id, organizationId);
        } catch (error) {
            // 6. MANEJAR ERRORES
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
    * Valida la estructura del config según su tipo
    */
    private validateConfig(config: any) {
        if (!config.type) {
            throw new BadRequestException('El config debe tener un campo "type"');
        }

        // TODO: Implementar validación según el tipo de workflow que se integre con Python agents
    }    
}
