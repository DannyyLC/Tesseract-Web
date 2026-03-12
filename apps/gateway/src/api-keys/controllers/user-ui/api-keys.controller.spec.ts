import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from '../../api-keys.service';
import { UserRole } from '@tesseract/types';

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
      const expectedResult = { id: '1', name: 'Test', apiKey: 'tst_live_123', isActive: true, createdAt: new Date(), updatedAt: new Date() };
      
      mockApiKeysService.create.mockResolvedValue(expectedResult as any);

      const result = await controller.create(mockUserPayload, createDto);

      expect(service.create).toHaveBeenCalledWith(mockUserPayload.organizationId, createDto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('findAll', () => {
    it('should return a list of API keys', async () => {
      const expectedResult = [{ id: '1', name: 'Test', isActive: true, createdAt: new Date() }];
      
      mockApiKeysService.findAll.mockResolvedValue(expectedResult as any);

      const result = await controller.findAll(mockUserPayload);

      expect(service.findAll).toHaveBeenCalledWith(mockUserPayload.organizationId);
      expect(result).toEqual(expectedResult);
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

      expect(service.update).toHaveBeenCalledWith(mockUserPayload.organizationId, apiKeyId, updateDto);
      expect(result).toEqual(expectedResult);
    });
  });
});
