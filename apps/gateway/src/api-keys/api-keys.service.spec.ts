import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeysService } from './api-keys.service';
import { PrismaService } from '../database/prisma.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ApiKeyUtil } from '../auth/utils/api-key.util';
import { PLANS } from '@tesseract/types';

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
        workflowId: null,
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
      });

      expect(result).toEqual({
        id: createdKey.id,
        name: createdKey.name,
        description: createdKey.description,
        apiKey: generatedKey,
        isActive: createdKey.isActive,
        workflowId: createdKey.workflowId,
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
      const maxApiKeys = PLANS['FREE'].limits.maxApiKeys;
      
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
    it('should return a list of API keys', async () => {
      const keys = [
        {
          id: 'key-1',
          name: 'Key 1',
          description: 'Desc 1',
          isActive: true,
          lastUsedAt: new Date(),
          expiresAt: null,
          workflowId: null,
          createdAt: new Date(),
        },
        {
          id: 'key-2',
          name: 'Key 2',
          description: null,
          isActive: false,
          lastUsedAt: null,
          expiresAt: new Date(),
          workflowId: 'wf-1',
          createdAt: new Date(),
        },
      ];

      mockPrismaService.apiKey.findMany.mockResolvedValue(keys);

      const result = await service.findAll(organizationId);

      expect(mockPrismaService.apiKey.findMany).toHaveBeenCalledWith({
        where: {
          organizationId,
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: keys[0].id,
        name: keys[0].name,
        description: keys[0].description ?? undefined,
        isActive: keys[0].isActive,
        lastUsedAt: keys[0].lastUsedAt,
        expiresAt: undefined,
        workflowId: keys[0].workflowId,
        createdAt: keys[0].createdAt,
      });
      expect(result[1]).toEqual({
        id: keys[1].id,
        name: keys[1].name,
        description: undefined,
        isActive: keys[1].isActive,
        lastUsedAt: undefined,
        expiresAt: keys[1].expiresAt,
        workflowId: keys[1].workflowId,
        createdAt: keys[1].createdAt,
      });
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
      mockPrismaService.apiKey.update.mockResolvedValue({ ...mockKey, deletedAt: new Date(), isActive: false });

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
        workflowId: null,
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
      });

      expect(result).toEqual({ ...updatedKey, lastUsedAt: undefined, expiresAt: undefined });
    });

    it('should throw BadRequestException if no fields provided to update', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue({
        id: apiKeyId,
        organizationId,
        deletedAt: null,
      });

      await expect(service.update(organizationId, apiKeyId, {})).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if key not found', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue(null);

      await expect(service.update(organizationId, apiKeyId, updateDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if key belongs to different organization', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue({
        id: apiKeyId,
        organizationId: 'other-org',
      });

      await expect(service.update(organizationId, apiKeyId, updateDto)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if key is deleted', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue({
        id: apiKeyId,
        organizationId,
        deletedAt: new Date(),
      });

      await expect(service.update(organizationId, apiKeyId, updateDto)).rejects.toThrow(ForbiddenException);
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
        workflowId: null,
        createdAt: new Date(),
      };

      mockPrismaService.apiKey.findUnique.mockResolvedValue(mockKey);

      const result = await service.findOne(organizationId, apiKeyId);

      expect(mockPrismaService.apiKey.findUnique).toHaveBeenCalledWith({
        where: { id: apiKeyId },
      });

      expect(result).toEqual({
        id: mockKey.id,
        name: mockKey.name,
        description: mockKey.description,
        isActive: mockKey.isActive,
        lastUsedAt: mockKey.lastUsedAt,
        expiresAt: undefined,
        workflowId: mockKey.workflowId,
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
