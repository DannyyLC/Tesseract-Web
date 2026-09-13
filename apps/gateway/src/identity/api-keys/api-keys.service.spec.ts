import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeysService } from './api-keys.service';
import { PrismaService } from '@/platform/database/prisma.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ApiKeyUtil } from '../auth/utils/api-key.util';
import { DEFAULT_PAGE_SIZE, PLANS } from '@tesseract/types';

jest.mock('../auth/utils/api-key.util');

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    organization: {
      findUnique: jest.fn(),
    },
    apiKey: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const organizationId = 'org-123';
  const apiKeyId = 'key-123';
  /** El `include` con el que todas las consultas resuelven `workflowName`. */
  const workflowNameInclude = { workflow: { select: { name: true } } };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
    prismaService = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      name: 'Test Key',
      description: 'Test Description',
      workflowId: 'wf-1',
    };

    it('should create an API key successfully', async () => {
      const mockOrganization = {
        id: organizationId,
        plan: 'FREE',
        _count: { apiKeys: 0 },
      };

      const generatedKey = 'tst_live_123456789';
      const hashedKey = 'hashed_key_123';

      mockPrismaService.organization.findUnique.mockResolvedValue(mockOrganization);
      (ApiKeyUtil.generate as jest.Mock).mockReturnValue(generatedKey);
      (ApiKeyUtil.hash as jest.Mock).mockReturnValue(hashedKey);

      const createdKey = {
        id: apiKeyId,
        name: createDto.name,
        description: createDto.description,
        keyHash: hashedKey,
        organizationId,
        isActive: true,
        workflowId: createDto.workflowId,
        workflow: { name: 'Workflow 1' },
        expiresAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.apiKey.create.mockResolvedValue(createdKey);

      const result = await service.create(organizationId, createDto);

      expect(mockPrismaService.organization.findUnique).toHaveBeenCalledWith({
        where: { id: organizationId },
        include: { _count: { select: { apiKeys: true } } },
      });
      expect(ApiKeyUtil.generate).toHaveBeenCalledWith('live');
      expect(ApiKeyUtil.hash).toHaveBeenCalledWith(generatedKey);
      expect(mockPrismaService.apiKey.create).toHaveBeenCalledWith({
        data: {
          name: createDto.name,
          description: createDto.description,
          keyHash: hashedKey,
          organizationId,
          workflowId: createDto.workflowId,
          expiresAt: undefined,
          isActive: true,
        },
        include: workflowNameInclude,
      });

      expect(result).toEqual({
        id: createdKey.id,
        name: createdKey.name,
        description: createdKey.description,
        apiKey: generatedKey,
        isActive: createdKey.isActive,
        workflowId: createdKey.workflowId,
        workflowName: 'Workflow 1',
        expiresAt: undefined,
        lastUsedAt: undefined,
        createdAt: createdKey.createdAt,
        updatedAt: createdKey.updatedAt,
      });
    });

    it('should throw NotFoundException if organization not found', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue(null);

      await expect(service.create(organizationId, createDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if max api keys limit is reached', async () => {
      // Simulate reaching limit for FREE plan (limit is usually 1, but we get it from PLANS)
      const maxApiKeys = PLANS.FREE.limits.maxApiKeys;

      const mockOrganization = {
        id: organizationId,
        plan: 'FREE',
        _count: { apiKeys: maxApiKeys },
      };

      mockPrismaService.organization.findUnique.mockResolvedValue(mockOrganization);

      await expect(service.create(organizationId, createDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    const keys = [
      {
        id: 'key-1',
        name: 'Key 1',
        description: 'Desc 1',
        isActive: true,
        lastUsedAt: new Date(),
        expiresAt: null,
        workflowId: 'wf-1',
        workflow: { name: 'Workflow 1' },
        createdAt: new Date(),
      },
      {
        id: 'key-2',
        name: 'Key 2',
        description: null,
        isActive: false,
        lastUsedAt: null,
        expiresAt: new Date(),
        workflowId: 'wf-2',
        workflow: { name: 'Workflow 2' },
        createdAt: new Date(),
      },
    ];

    it('should return a paginated list of API keys with the workflow name resolved', async () => {
      mockPrismaService.apiKey.findMany.mockResolvedValue(keys);

      const result = await service.findAll(organizationId);

      expect(mockPrismaService.apiKey.findMany).toHaveBeenCalledWith({
        take: DEFAULT_PAGE_SIZE + 1, // tamaño por defecto + 1 para detectar la página siguiente
        skip: 0,
        cursor: undefined,
        where: {
          organizationId,
          deletedAt: null,
        },
        include: workflowNameInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });

      expect(result.items).toHaveLength(2);
      expect(result.nextPageAvailable).toBe(false);
      expect(result.items[0]).toEqual({
        id: keys[0].id,
        name: keys[0].name,
        description: keys[0].description ?? undefined,
        isActive: keys[0].isActive,
        lastUsedAt: keys[0].lastUsedAt,
        expiresAt: undefined,
        workflowId: keys[0].workflowId,
        workflowName: 'Workflow 1',
        createdAt: keys[0].createdAt,
      });
      expect(result.items[1]).toEqual({
        id: keys[1].id,
        name: keys[1].name,
        description: undefined,
        isActive: keys[1].isActive,
        lastUsedAt: undefined,
        expiresAt: keys[1].expiresAt,
        workflowId: keys[1].workflowId,
        workflowName: 'Workflow 2',
        createdAt: keys[1].createdAt,
      });
    });

    it('should narrow the query when filtering by workflow and search', async () => {
      mockPrismaService.apiKey.findMany.mockResolvedValue([keys[0]]);

      await service.findAll(organizationId, null, 10, null, {
        workflowId: 'wf-1',
        search: 'prod',
      });

      expect(mockPrismaService.apiKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId,
            deletedAt: null,
            workflowId: 'wf-1',
            name: { contains: 'prod', mode: 'insensitive' },
          },
        }),
      );
    });

    it('should page forward with a cursor and report the next page', async () => {
      // Una fila de más que el `take`: así es como el util detecta que hay página siguiente.
      mockPrismaService.apiKey.findMany.mockResolvedValue(keys);

      const result = await service.findAll(organizationId, 'key-0', 1, 'next');

      expect(mockPrismaService.apiKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 2,
          skip: 1,
          cursor: { id: 'key-0' },
        }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.nextPageAvailable).toBe(true);
      expect(result.nextCursor).toBe('key-1');
    });

    it('should use a negative take when paging backwards', async () => {
      mockPrismaService.apiKey.findMany.mockResolvedValue([keys[0]]);

      await service.findAll(organizationId, 'key-9', 10, 'prev');

      expect(mockPrismaService.apiKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: -11, skip: 1, cursor: { id: 'key-9' } }),
      );
    });
  });

  describe('delete', () => {
    it('should delete an API key successfully', async () => {
      const mockKey = {
        id: apiKeyId,
        organizationId,
        deletedAt: null,
      };

      mockPrismaService.apiKey.findUnique.mockResolvedValue(mockKey);
      mockPrismaService.apiKey.update.mockResolvedValue({
        ...mockKey,
        deletedAt: new Date(),
        isActive: false,
      });

      const result = await service.delete(organizationId, apiKeyId);

      expect(mockPrismaService.apiKey.findUnique).toHaveBeenCalledWith({
        where: { id: apiKeyId },
      });
      expect(mockPrismaService.apiKey.update).toHaveBeenCalledWith({
        where: { id: apiKeyId },
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          isActive: false,
        }),
      });
      expect(result).toEqual({ success: true, message: 'API Key eliminada exitosamente' });
    });

    it('should throw NotFoundException if key not found', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue(null);

      await expect(service.delete(organizationId, apiKeyId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if key belongs to different organization', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue({
        id: apiKeyId,
        organizationId: 'other-org',
      });

      await expect(service.delete(organizationId, apiKeyId)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if key is already deleted', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue({
        id: apiKeyId,
        organizationId,
        deletedAt: new Date(),
      });

      await expect(service.delete(organizationId, apiKeyId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    const updateDto = {
      name: 'Updated Key',
      description: 'Updated Description',
      isActive: false,
    };

    it('should update an API key successfully', async () => {
      const mockKey = {
        id: apiKeyId,
        organizationId,
        deletedAt: null,
      };

      const updatedKey = {
        id: apiKeyId,
        name: updateDto.name,
        description: updateDto.description,
        isActive: updateDto.isActive,
        lastUsedAt: null,
        expiresAt: null,
        workflowId: 'wf-1',
        workflow: { name: 'Workflow 1' },
        createdAt: new Date(),
      };

      mockPrismaService.apiKey.findUnique.mockResolvedValue(mockKey);
      mockPrismaService.apiKey.update.mockResolvedValue(updatedKey);

      const result = await service.update(organizationId, apiKeyId, updateDto);

      expect(mockPrismaService.apiKey.findUnique).toHaveBeenCalledWith({
        where: { id: apiKeyId },
      });
      expect(mockPrismaService.apiKey.update).toHaveBeenCalledWith({
        where: { id: apiKeyId },
        data: updateDto,
        include: workflowNameInclude,
      });

      const { workflow, ...expected } = updatedKey;
      expect(result).toEqual({
        ...expected,
        lastUsedAt: undefined,
        expiresAt: undefined,
        workflowName: workflow.name,
      });
    });

    it('should throw BadRequestException if no fields provided to update', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue({
        id: apiKeyId,
        organizationId,
        deletedAt: null,
      });

      await expect(service.update(organizationId, apiKeyId, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if key not found', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue(null);

      await expect(service.update(organizationId, apiKeyId, updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if key belongs to different organization', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue({
        id: apiKeyId,
        organizationId: 'other-org',
      });

      await expect(service.update(organizationId, apiKeyId, updateDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException if key is deleted', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue({
        id: apiKeyId,
        organizationId,
        deletedAt: new Date(),
      });

      await expect(service.update(organizationId, apiKeyId, updateDto)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('findOne', () => {
    it('should return a single API key', async () => {
      const mockKey = {
        id: apiKeyId,
        organizationId,
        name: 'Key',
        description: 'Desc',
        isActive: true,
        lastUsedAt: new Date(),
        expiresAt: null,
        workflowId: 'wf-1',
        workflow: { name: 'Workflow 1' },
        createdAt: new Date(),
      };

      mockPrismaService.apiKey.findUnique.mockResolvedValue(mockKey);

      const result = await service.findOne(organizationId, apiKeyId);

      expect(mockPrismaService.apiKey.findUnique).toHaveBeenCalledWith({
        where: { id: apiKeyId },
        include: workflowNameInclude,
      });

      expect(result).toEqual({
        id: mockKey.id,
        name: mockKey.name,
        description: mockKey.description,
        isActive: mockKey.isActive,
        lastUsedAt: mockKey.lastUsedAt,
        expiresAt: undefined,
        workflowId: mockKey.workflowId,
        workflowName: 'Workflow 1',
        createdAt: mockKey.createdAt,
      });
    });

    it('should throw NotFoundException if key not found', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue(null);

      await expect(service.findOne(organizationId, apiKeyId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if key belongs to different organization', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue({
        id: apiKeyId,
        organizationId: 'other-org',
      });

      await expect(service.findOne(organizationId, apiKeyId)).rejects.toThrow(ForbiddenException);
    });
  });
});
