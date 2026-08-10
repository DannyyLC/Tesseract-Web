import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from '../../api-keys.service';
import { UserRole } from '@tesseract/database';

describe('ApiKeysController', () => {
  let controller: ApiKeysController;
  let service: ApiKeysService;

  const mockApiKeysService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
  };

  const mockUserPayload = {
    sub: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    role: UserRole.ADMIN,
    organizationId: 'org-123',
    sessionId: 'session-123',
  };

  const apiKeyId = 'key-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeysController],
      providers: [
        {
          provide: ApiKeysService,
          useValue: mockApiKeysService,
        },
      ],
    }).compile();

    controller = module.get<ApiKeysController>(ApiKeysController);
    service = module.get<ApiKeysService>(ApiKeysService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create an API key', async () => {
      const createDto = { name: 'Test', description: 'Test Desc', workflowId: 'wf-1' };
      const expectedResult = {
        id: '1',
        name: 'Test',
        apiKey: 'tst_live_123',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockApiKeysService.create.mockResolvedValue(expectedResult as any);

      const result = await controller.create(mockUserPayload, createDto);

      expect(service.create).toHaveBeenCalledWith(mockUserPayload.organizationId, createDto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('findAll', () => {
    const expectedResult = {
      items: [{ id: '1', name: 'Test', isActive: true, createdAt: new Date() }],
      nextCursor: null,
      prevCursor: null,
      nextPageAvailable: false,
      pageSize: 10,
    };

    it('should return a paginated list of API keys', async () => {
      mockApiKeysService.findAll.mockResolvedValue(expectedResult as any);

      const result = await controller.findAll(mockUserPayload, null, 10, null);

      expect(service.findAll).toHaveBeenCalledWith(mockUserPayload.organizationId, null, 10, null, {
        workflowId: undefined,
        search: undefined,
      });
      expect(result).toEqual(expectedResult);
    });

    it('should forward the workflow and search filters', async () => {
      mockApiKeysService.findAll.mockResolvedValue(expectedResult as any);

      await controller.findAll(mockUserPayload, 'key-9', 5, 'next', 'wf-1', 'prod');

      expect(service.findAll).toHaveBeenCalledWith(
        mockUserPayload.organizationId,
        'key-9',
        5,
        'next',
        { workflowId: 'wf-1', search: 'prod' },
      );
    });
  });

  describe('findOne', () => {
    it('should return a single API key', async () => {
      const expectedResult = { id: '1', name: 'Test', isActive: true, createdAt: new Date() };

      mockApiKeysService.findOne.mockResolvedValue(expectedResult as any);

      const result = await controller.findOne(mockUserPayload, apiKeyId);

      expect(service.findOne).toHaveBeenCalledWith(mockUserPayload.organizationId, apiKeyId);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('delete', () => {
    it('should delete an API key', async () => {
      const expectedResult = { success: true, message: 'Deleted' };

      mockApiKeysService.delete.mockResolvedValue(expectedResult as any);

      const result = await controller.delete(mockUserPayload, apiKeyId);

      expect(service.delete).toHaveBeenCalledWith(mockUserPayload.organizationId, apiKeyId);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('update', () => {
    it('should update an API key', async () => {
      const updateDto = { name: 'Updated' };
      const expectedResult = { id: '1', name: 'Updated', isActive: true, createdAt: new Date() };

      mockApiKeysService.update.mockResolvedValue(expectedResult as any);

      const result = await controller.update(mockUserPayload, apiKeyId, updateDto);

      expect(service.update).toHaveBeenCalledWith(
        mockUserPayload.organizationId,
        apiKeyId,
        updateDto,
      );
      expect(result).toEqual(expectedResult);
    });
  });
});
