import {
    Injectable,
    NotFoundException,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';


/**
 * Service que maneja la logica de negocio de workflows
 */

@Injectable()
export class WorkflowsService {
    private readonly logger = new Logger(WorkflowsService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Crear un nuevo workflow
     */
    async create(clientId: string, dto: CreateWorkflowDto) {
        this.validateConfig(dto.config);

        const currentCount = await this.prisma.workflow.count({
            where: {
                clientId,
                deletedAt: null,
            },
        });

        const client = await this.prisma.client.findUnique({
            where: { id: clientId },
            select: { maxWorkflows: true, plan: true },
        });

        if (!client) {
            throw new NotFoundException(`Client with id ${clientId} not found`);
        }

        if (currentCount >= client.maxWorkflows) {
            throw new BadRequestException(
                `Has alcanzado el limite de ${client.maxWorkflows} workflows para el plan ${client.plan}`,
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
                clientId,
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

        this.logger.log(`Workflow creado ${workflow.id} por cliente ${clientId}`);
        return workflow;
    }

    /**
    * Listar workflows del cliente
    */
    async findAll(clientId: string, includeDeleted: boolean = false) {
        return this.prisma.workflow.findMany({
        where: {
            clientId,
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
    async findOne(clientId: string, workflowId: string) {
        const workflow = await this.prisma.workflow.findFirst({
            where: {
                id: workflowId,
                clientId,
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
    async update(clientId: string, workflowId: string, dto: UpdateWorkflowDto) {
        // 1. Verificar que existe y pertenece al cliente
        const existing = await this.findOne(clientId, workflowId);

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
            version: existing.version + 1, // ✅ Incrementar versión
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
    async remove(clientId: string, workflowId: string) {
        // 1. Verificar que existe y pertenece al cliente
        await this.findOne(clientId, workflowId);

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
    * Valida la estructura del config según su tipo
    */
    private validateConfig(config: any) {
        if (!config.type) {
        throw new BadRequestException('El config debe tener un campo "type"');
        }

        if (config.type === 'n8n') {
        if (!config.webhookUrl) {
            throw new BadRequestException('El config de tipo n8n requiere "webhookUrl"');
        }
        if (!config.method) {
            throw new BadRequestException('El config de tipo n8n requiere "method"');
        }
        } else if (config.type === 'custom') {
        if (!config.steps && !config.endpoint) {
            throw new BadRequestException(
            'El config de tipo custom requiere "steps" o "endpoint"',
            );
        }
        } else {
        throw new BadRequestException(
            'El tipo de config debe ser "n8n" o "custom"',
        );
        }
    }    
}
