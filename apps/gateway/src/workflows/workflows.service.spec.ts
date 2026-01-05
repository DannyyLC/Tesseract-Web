import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowsService } from './workflows.service';
import { PrismaService } from '../database/prisma.service';
import { ExecutionsService } from '../executions/executions.service';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import {
  WorkflowNotFoundException,
  WorkflowPausedException,
  InvalidWorkflowConfigException,
} from '../common/exceptions';
import { PLANS } from '@workflow-automation/shared-types';

describe('WorkflowsService', () => {
    let service: WorkflowsService;
    let prismaService: jest.Mocked<PrismaService>;
    let executionsService: jest.Mocked<ExecutionsService>;
    let organizationsService: jest.Mocked<OrganizationsService>;

    // Silenciar logs durante los tests
    beforeAll(() => {
        jest.spyOn(Logger.prototype, 'log').mockImplementation();
        jest.spyOn(Logger.prototype, 'error').mockImplementation();
        jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    // Mock data común para todos los tests
    const mockOrganizationId = 'org-123';
    const mockWorkflowId = 'wf-456';
    const mockUserId = 'user-789';

    const mockWorkflow = {
        id: mockWorkflowId,
        name: 'Test Workflow',
        description: 'Test description',
        config: {
            type: 'agent',
            graph: { type: 'react', config: {} },
            agents: {
                default: {
                    model: 'gpt-4o',
                    temperature: 0.7,
                    system_prompt: 'You are a helpful assistant',
                    tools: [],
                },
            },
        },
        isActive: true,
        isPaused: false,
        schedule: null,
        timezone: 'UTC',
        timeout: 300,
        maxRetries: 3,
        triggerType: 'manual',
        organizationId: mockOrganizationId,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        tags: [],
        executions: [],
    };
    const mockOrganization = {
        id: mockOrganizationId,
        name: 'Test Organization',
        plan: PLANS.free, 
    };

    beforeEach(async () => {
        // Crear mocks de todos los servicios
        const mockPrismaService = {
        workflow: {
            create: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
        },
        organization: {
            findUnique: jest.fn(),
        },
        execution: {
            count: jest.fn(),
        },
        };
        const mockExecutionsService = {
        create: jest.fn(),
        updateStatus: jest.fn(),
        findOne: jest.fn(),
        };
        const mockOrganizationsService = {
        canAddWorkflow: jest.fn(),
        };
        const module: TestingModule = await Test.createTestingModule({
        providers: [
            WorkflowsService,
            {
            provide: PrismaService,
            useValue: mockPrismaService,
            },
            {
            provide: ExecutionsService,
            useValue: mockExecutionsService,
            },
            {
            provide: OrganizationsService,
            useValue: mockOrganizationsService,
            },
        ],
        }).compile();

        service = module.get<WorkflowsService>(WorkflowsService);
        prismaService = module.get(PrismaService);
        executionsService = module.get(ExecutionsService);
        organizationsService = module.get(OrganizationsService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // Test para create()
    describe('create', () => {
        const createDto = {
        name: 'New Workflow',
        description: 'New workflow description',
        config: {
            type: 'agent' as const,
            graph: { type: 'react' as const, config: {} },
            agents: {
                default: {
                    model: 'gpt-4o',
                    temperature: 0.7,
                    system_prompt: 'You are a helpful assistant',
                    tools: [],
                },
            },
        },
        isActive: true,
        isPaused: false,
        triggerType: 'manual' as const,
        };
        it('should create a workflow successfully', async () => {
            organizationsService.canAddWorkflow.mockResolvedValue(true);
            (prismaService.workflow.create as jest.Mock).mockResolvedValue(mockWorkflow as any);

            const result = await service.create(mockOrganizationId, createDto);

            expect(result).toEqual(mockWorkflow);
            expect(organizationsService.canAddWorkflow).toHaveBeenCalledWith(
                mockOrganizationId,
            );
            expect(prismaService.workflow.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    name: createDto.name,
                    description: createDto.description,
                    config: createDto.config,
                    organizationId: mockOrganizationId,
                }),
                include: { tags: true },
            });
        });
        it('should create a workflow with tags', async () => {
            // Arrange
            const dtoWithTags = { ...createDto, tagIds: ['tag-1', 'tag-2'] };
            organizationsService.canAddWorkflow.mockResolvedValue(true);
            (prismaService.workflow.create as jest.Mock).mockResolvedValue(mockWorkflow as any);

            // Act
            await service.create(mockOrganizationId, dtoWithTags);

            // Assert
            expect(prismaService.workflow.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                tags: {
                    connect: [{ id: 'tag-1' }, { id: 'tag-2' }],
                },
                }),
                include: { tags: true },
            });
        });
        it('should throw ForbiddenException when workflow limit is reached', async () => {
            // Arrange
            organizationsService.canAddWorkflow.mockResolvedValue(false);
            (prismaService.organization.findUnique as jest.Mock).mockResolvedValue({
                id: mockOrganizationId,
                plan: 'free',  // ✅ Valor válido de PlanType
            } as any);

            // Act & Assert
            await expect(
                service.create(mockOrganizationId, createDto),
            ).rejects.toThrow(ForbiddenException);
            
            expect(organizationsService.canAddWorkflow).toHaveBeenCalledWith(
                mockOrganizationId,
            );
        });
        it('should throw BadRequestException when config is invalid (missing type)', async () => {
            // Arrange
            const invalidDto = {
                ...createDto,
                config: { graph: { type: 'react' } }, // Falta 'type'
            };
            organizationsService.canAddWorkflow.mockResolvedValue(true);

            // Act & Assert
            await expect(
                service.create(mockOrganizationId, invalidDto as any),
            ).rejects.toThrow(BadRequestException);
        });
        it('should throw BadRequestException when agent config is missing required fields', async () => {
            // Arrange
            const invalidDto = {
                ...createDto,
                config: { type: 'agent' }, // Falta graph y agents
            };
            organizationsService.canAddWorkflow.mockResolvedValue(true);

            // Act & Assert
            await expect(
                service.create(mockOrganizationId, invalidDto as any),
            ).rejects.toThrow(BadRequestException);
        });
        it('should use default values when optional fields are not provided', async () => {
            // Arrange
            const minimalDto = {
                name: 'Minimal Workflow',
                config: {
                    type: 'agent' as const,
                    graph: { type: 'react' as const, config: {} },
                    agents: {
                        default: { model: 'gpt-4o', tools: [] },
                    },
                },
                triggerType: 'manual' as const,
            };
            organizationsService.canAddWorkflow.mockResolvedValue(true);
            (prismaService.workflow.create as jest.Mock).mockResolvedValue(mockWorkflow as any);

            // Act
            await service.create(mockOrganizationId, minimalDto);

            // Assert
            expect(prismaService.workflow.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                isActive: true, // default
                isPaused: false, // default
                timezone: 'UTC', // default
                timeout: 300, // default
                maxRetries: 3, // default
                }),
                include: { tags: true },
            });
        });
    });

    // Test para findAll()
    describe('findMany', () => {
        it('should return all workflows for an organization', async () => {
            const mockWorkflows = [mockWorkflow, { ...mockWorkflow, id: 'wf-798' }];
            (prismaService.workflow.findMany as jest.Mock).mockResolvedValue(mockWorkflows as any);

            const result = await service.findAll(mockOrganizationId);

            expect(result).toEqual(mockWorkflows);
            expect(prismaService.workflow.findMany).toHaveBeenCalledWith({
                where: { 
                    organizationId: mockOrganizationId,
                    deletedAt: null,
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
        });
        it('should include deleted workflows when includeDeleted is true', async () => {
            (prismaService.workflow.findMany as jest.Mock).mockResolvedValue([mockWorkflow] as any);

            await service.findAll(mockOrganizationId, true);

            expect(prismaService.workflow.findMany).toHaveBeenCalledWith({
                where: {
                    organizationId: mockOrganizationId,
                    // No debe incluir deletedAt: null
                },
                include: expect.any(Object),
                orderBy: expect.any(Object),
            });
        });
        it('should return empty array when no workflows exist', async () => {
            (prismaService.workflow.findMany as jest.Mock).mockResolvedValue([]);

            const result = await service.findAll(mockOrganizationId);

            expect(result).toEqual([]);
        });
    });

    // Test para findOne()
    describe('findOne', () => {
        it('should return a workflow by id', async () => {
            // Arrange
            const mockWorkflowWithExecutions = {
                ...mockWorkflow,
                executions: [
                { id: 'exec-1', status: 'completed' },
                { id: 'exec-2', status: 'running' },
                ],
            };
            (prismaService.workflow.findFirst as jest.Mock).mockResolvedValue(
                mockWorkflowWithExecutions as any,
            );

            // Act
            const result = await service.findOne(mockOrganizationId, mockWorkflowId);

            // Assert
            expect(result).toEqual(mockWorkflowWithExecutions);
            expect(prismaService.workflow.findFirst).toHaveBeenCalledWith({
                where: {
                id: mockWorkflowId,
                organizationId: mockOrganizationId,
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
        });
        it('should throw NotFoundException when workflow does not exist', async () => {
            // Arrange
            (prismaService.workflow.findFirst as jest.Mock).mockResolvedValue(null);

            // Act & Assert
            await expect(
                service.findOne(mockOrganizationId, 'non-existent-id'),
            ).rejects.toThrow(NotFoundException);
        });
        it('should throw NotFoundException when workflow is deleted', async () => {
            // Arrange
            (prismaService.workflow.findFirst as jest.Mock).mockResolvedValue(null);

            // Act & Assert
            await expect(
                service.findOne(mockOrganizationId, mockWorkflowId),
            ).rejects.toThrow(NotFoundException);
        });
        it('should throw NotFoundException when workflow belongs to different organization', async () => {
            // Arrange
            (prismaService.workflow.findFirst as jest.Mock).mockResolvedValue(null);

            // Act & Assert
            await expect(
                service.findOne('different-org-id', mockWorkflowId),
            ).rejects.toThrow(NotFoundException);
        });
    });

    // Test para udate()
    describe('update', () => {
        const updateDto = {
            name: 'Updated Workflow',
            description: 'Updated description',
        };
        it('should update a workflow successfully', async () => {
            // Arrange
            (prismaService.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow as any);
            const updatedWorkflow = { ...mockWorkflow, ...updateDto, version: 2 };
            (prismaService.workflow.update as jest.Mock).mockResolvedValue(updatedWorkflow as any);

            // Act
            const result = await service.update(
                mockOrganizationId,
                mockWorkflowId,
                updateDto,
            );

            // Assert
            expect(result).toEqual(updatedWorkflow);
            expect(prismaService.workflow.update).toHaveBeenCalledWith({
                where: { id: mockWorkflowId },
                data: expect.objectContaining({
                name: updateDto.name,
                description: updateDto.description,
                version: 2, // version incrementada
                }),
                include: { tags: true },
            });
        });
        it('should increment version when updating', async () => {
            // Arrange
            const workflowVersion5 = { ...mockWorkflow, version: 5 };
            (prismaService.workflow.findFirst as jest.Mock).mockResolvedValue(
                workflowVersion5 as any,
            );
            (prismaService.workflow.update as jest.Mock).mockResolvedValue({
                ...workflowVersion5,
                version: 6,
            } as any);

            // Act
            await service.update(mockOrganizationId, mockWorkflowId, updateDto);

            // Assert
            expect(prismaService.workflow.update).toHaveBeenCalledWith({
                where: { id: mockWorkflowId },
                data: expect.objectContaining({
                version: 6,
                }),
                include: { tags: true },
            });
        });
        it('should update tags when tagIds are provided', async () => {
            // Arrange
            const updateDtoWithTags = { ...updateDto, tagIds: ['tag-3', 'tag-4'] };
            (prismaService.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow as any);
            (prismaService.workflow.update as jest.Mock).mockResolvedValue(mockWorkflow as any);

            // Act
            await service.update(
                mockOrganizationId,
                mockWorkflowId,
                updateDtoWithTags,
            );

            // Assert
            expect(prismaService.workflow.update).toHaveBeenCalledWith({
                where: { id: mockWorkflowId },
                data: expect.objectContaining({
                tags: {
                    set: [], // Limpiar tags actuales
                    connect: [{ id: 'tag-3' }, { id: 'tag-4' }],
                },
                }),
                include: { tags: true },
            });
        });
        it('should validate config when updating', async () => {
            // Arrange
            const updateDtoWithInvalidConfig = {
                config: { type: 'agent' }, // Falta graph y agents
            };
            (prismaService.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow as any);

            // Act & Assert
            await expect(
                service.update(
                mockOrganizationId,
                mockWorkflowId,
                updateDtoWithInvalidConfig as any,
                ),
            ).rejects.toThrow(BadRequestException);
        });
        it('should throw NotFoundException when workflow does not exist', async () => {
            // Arrange
            (prismaService.workflow.findFirst as jest.Mock).mockResolvedValue(null);

            // Act & Assert
            await expect(
                service.update(mockOrganizationId, 'non-existent-id', updateDto),
            ).rejects.toThrow(NotFoundException);
        });
    });

    // Test para remove()
    describe('remove', () => {
        it('should soft delete a workflow', async () => {
            // Arrange
            (prismaService.workflow.findFirst as jest.Mock).mockResolvedValue(mockWorkflow as any);
            const deletedWorkflow = {
                ...mockWorkflow,
                deletedAt: new Date(),
                isActive: false,
            };
            (prismaService.workflow.update as jest.Mock).mockResolvedValue(deletedWorkflow as any);

            // Act
            const result = await service.remove(mockOrganizationId, mockWorkflowId);

            // Assert
            expect(result).toEqual({
                message: 'Workflow eliminado exitosamente',
                workflow: deletedWorkflow,
            });
            expect(prismaService.workflow.update).toHaveBeenCalledWith({
                where: { id: mockWorkflowId },
                data: {
                deletedAt: expect.any(Date),
                isActive: false,
                },
            });
        });
        it('should also deactivate the workflow when deleting', async () => {
            // Arrange
            const activeWorkflow = { ...mockWorkflow, isActive: true };
            (prismaService.workflow.findFirst as jest.Mock).mockResolvedValue(activeWorkflow as any);
            (prismaService.workflow.update as jest.Mock).mockResolvedValue({
                ...activeWorkflow,
                isActive: false,
            } as any);

            // Act
            await service.remove(mockOrganizationId, mockWorkflowId);

            // Assert
            expect(prismaService.workflow.update).toHaveBeenCalledWith({
                where: { id: mockWorkflowId },
                data: expect.objectContaining({
                isActive: false,
                }),
            });
        });
        it('should throw NotFoundException when workflow does not exist', async () => {
            // Arrange
            (prismaService.workflow.findFirst as jest.Mock).mockResolvedValue(null);

            // Act & Assert
            await expect(
                service.remove(mockOrganizationId, 'non-existent-id'),
            ).rejects.toThrow(NotFoundException);
        });
    });    

    // Test para execute()
    describe('execute', () => {
        const executeInput = { key: 'value' };
        const executeMetadata = { source: 'api' };
        const mockExecution = {
            id: 'exec-123',
            workflowId: mockWorkflowId,
            status: 'running',
            startedAt: new Date(),
        };

        beforeEach(() => {
            // Setup común para tests de ejecución
            (prismaService.workflow.findFirst as jest.Mock).mockResolvedValue({
                ...mockWorkflow,
                organization: mockOrganization,
            } as any);
            executionsService.create.mockResolvedValue(mockExecution as any);
            executionsService.findOne.mockResolvedValue({
                ...mockExecution,
                status: 'completed',
            } as any);
            (prismaService.execution.count as jest.Mock).mockResolvedValue(0);
        });
        it('should execute a workflow successfully', async () => {
            // Arrange
            const mockN8nResult = { success: true, data: 'result' };
            n8nService.executeWebhook.mockResolvedValue(mockN8nResult);
            executionsService.updateStatus.mockResolvedValue({
                ...mockExecution,
                status: 'completed',
                finishedAt: new Date(),
            } as any);

            // Act
            const result = await service.execute(
                mockOrganizationId,
                mockWorkflowId,
                executeInput,
                executeMetadata,
                mockUserId,
            );

            // Assert
            expect(result.status).toBe('completed');
            expect(executionsService.create).toHaveBeenCalledWith(
                mockWorkflowId,
                'api',
                expect.objectContaining({
                input: executeInput,
                metadata: executeMetadata,
                userId: mockUserId,
                }),
            );
            expect(n8nService.executeWebhook).toHaveBeenCalled();
            expect(executionsService.updateStatus).toHaveBeenCalledWith(
                mockExecution.id,
                'completed',
                { result: mockN8nResult },
            );
        });
        it('should throw WorkflowNotFoundException when workflow does not exist', async () => {
            // Arrange
            (prismaService.workflow.findFirst as jest.Mock).mockResolvedValue(null);

            // Act & Assert
            await expect(
                service.execute(
                mockOrganizationId,
                'non-existent-id',
                executeInput,
                ),
            ).rejects.toThrow(WorkflowNotFoundException);
        });
        it('should throw InvalidWorkflowConfigException when workflow is inactive', async () => {
            // Arrange
            (prismaService.workflow.findFirst as jest.Mock).mockResolvedValue({
                ...mockWorkflow,
                isActive: false,
                organization: mockOrganization,
            } as any);

            // Act & Assert
            await expect(
                service.execute(mockOrganizationId, mockWorkflowId, executeInput),
            ).rejects.toThrow(InvalidWorkflowConfigException);
        });
        it('should throw WorkflowPausedException when workflow is paused', async () => {
            // Arrange
            (prismaService.workflow.findFirst as jest.Mock).mockResolvedValue({
                ...mockWorkflow,
                isPaused: true,
                organization: mockOrganization,
            } as any);

            // Act & Assert
            await expect(
                service.execute(mockOrganizationId, mockWorkflowId, executeInput),
            ).rejects.toThrow(WorkflowPausedException);
        });
        it('should handle execution errors and update status to failed', async () => {
            // Arrange
            const error = new Error('Execution failed');
            n8nService.executeWebhook.mockRejectedValue(error);
            executionsService.updateStatus.mockResolvedValue({
                ...mockExecution,
                status: 'failed',
            } as any);

            // Act & Assert
            await expect(
                service.execute(mockOrganizationId, mockWorkflowId, executeInput),
            ).rejects.toThrow(error);

            expect(executionsService.updateStatus).toHaveBeenCalledWith(
                mockExecution.id,
                'failed',
                expect.objectContaining({
                error: error.message,
                errorStack: error.stack,
                }),
            );
        });
        it('should throw error when workflow type is not supported', async () => {
            // Arrange
            (prismaService.workflow.findFirst as jest.Mock).mockResolvedValue({
                ...mockWorkflow,
                config: { type: 'unsupported' },
                organization: mockOrganization,
            } as any);
            executionsService.updateStatus.mockResolvedValue({
                ...mockExecution,
                status: 'failed',
            } as any);

            // Act & Assert
            await expect(
                service.execute(mockOrganizationId, mockWorkflowId, executeInput),
            ).rejects.toThrow(InvalidWorkflowConfigException);

            expect(executionsService.updateStatus).toHaveBeenCalledWith(
                mockExecution.id,
                'failed',
                expect.any(Object),
            );
        });
        it('should throw error when config does not have type', async () => {
            // Arrange
            (prismaService.workflow.findFirst as jest.Mock).mockResolvedValue({
                ...mockWorkflow,
                config: { graph: { type: 'react' } }, // Sin type
                organization: mockOrganization,
            } as any);
            executionsService.updateStatus.mockResolvedValue({
                ...mockExecution,
                status: 'failed',
            } as any);

            // Act & Assert
            await expect(
                service.execute(mockOrganizationId, mockWorkflowId, executeInput),
            ).rejects.toThrow(InvalidWorkflowConfigException);

            expect(executionsService.updateStatus).toHaveBeenCalledWith(
                mockExecution.id,
                'failed',
                expect.any(Object),
            );
        });
        it('should execute with apiKeyId when provided', async () => {
            // Arrange
            const mockApiKeyId = 'api-key-123';
            agentsService.execute.mockResolvedValue({ success: true });
            executionsService.updateStatus.mockResolvedValue({
                ...mockExecution,
                status: 'completed',
            } as any);

            // Act
            await service.execute(
                mockOrganizationId,
                mockWorkflowId,
                executeInput,
                executeMetadata,
                undefined, // No userId
                mockApiKeyId,
            );

            // Assert
            expect(executionsService.create).toHaveBeenCalledWith(
                mockWorkflowId,
                'api',
                expect.objectContaining({
                apiKeyId: mockApiKeyId,
                }),
            );
        });
        it('should throw NotFoundException when organization is not found', async () => {
            // Arrange
            (prismaService.workflow.findFirst as jest.Mock).mockResolvedValue({
                ...mockWorkflow,
                organization: null, // Sin organización
            } as any);

            // Act & Assert
            await expect(
                service.execute(mockOrganizationId, mockWorkflowId, executeInput),
            ).rejects.toThrow(NotFoundException);
        });
    });

    // Test para validateConfig()  
    describe('validateConfig (tested via create)', () => {
        it('should accept valid agent config', async () => {
            // Arrange
            const validDto = {
                name: 'Test',
                config: {
                    type: 'agent' as const,
                    graph: { type: 'react' as const, config: {} },
                    agents: {
                        default: { model: 'gpt-4o', tools: [] },
                    },
                },
                triggerType: 'manual' as const,
            };
            organizationsService.canAddWorkflow.mockResolvedValue(true);
            (prismaService.workflow.create as jest.Mock).mockResolvedValue(mockWorkflow as any);

            // Act & Assert
            await expect(
                service.create(mockOrganizationId, validDto),
            ).resolves.toBeDefined();
        });
        it('should accept valid custom config with steps', async () => {
            // Arrange
            const validDto = {
                name: 'Test',
                config: {
                type: 'custom' as const,
                steps: [{ action: 'test' }],
                },
                triggerType: 'manual' as const,
            };
            organizationsService.canAddWorkflow.mockResolvedValue(true);
            (prismaService.workflow.create as jest.Mock).mockResolvedValue(mockWorkflow as any);

            // Act & Assert
            await expect(
                service.create(mockOrganizationId, validDto),
            ).resolves.toBeDefined();
        });
        it('should accept valid custom config with endpoint', async () => {
            // Arrange
            const validDto = {
                name: 'Test',
                config: {
                type: 'custom' as const,
                endpoint: 'https://api.example.com',
                },
                triggerType: 'manual' as const,
            };
            organizationsService.canAddWorkflow.mockResolvedValue(true);
            (prismaService.workflow.create as jest.Mock).mockResolvedValue(mockWorkflow as any);
            // Act & Assert
            await expect(
                service.create(mockOrganizationId, validDto),
            ).resolves.toBeDefined();
        });
        it('should reject custom config without steps or endpoint', async () => {
            // Arrange
            const invalidDto = {
                name: 'Test',
                config: {
                type: 'custom',
                // Sin steps ni endpoint
                },
                triggerType: 'manual' as const,
            };
            organizationsService.canAddWorkflow.mockResolvedValue(true);

            // Act & Assert
            await expect(
                service.create(mockOrganizationId, invalidDto as any),
            ).rejects.toThrow(BadRequestException);
        });
        it('should reject invalid config type', async () => {
            // Arrange
            const invalidDto = {
                name: 'Test',
                config: {
                type: 'invalid-type',
                },
                triggerType: 'manual' as const,
            };
            organizationsService.canAddWorkflow.mockResolvedValue(true);

            // Act & Assert
            await expect(
                service.create(mockOrganizationId, invalidDto as any),
            ).rejects.toThrow(BadRequestException);
        });
    });
});


