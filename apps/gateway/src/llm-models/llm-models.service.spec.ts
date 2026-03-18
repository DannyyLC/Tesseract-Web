import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { LlmModelsService } from './llm-models.service';
import { PrismaService } from '../database/prisma.service';
import { ModelTier } from '@tesseract/database';

const mockPrismaService = {
  llmModel: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

describe('LlmModelsService', () => {
  let service: LlmModelsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmModelsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<LlmModelsService>(LlmModelsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      provider: 'openai',
      modelName: 'gpt-4o',
      tier: ModelTier.STANDARD,
      inputPricePer1m: 2.5,
      outputPricePer1m: 10.0,
      contextWindow: 128000,
      recommendedMaxTokens: 100000,
      effectiveFrom: '2025-01-01T00:00:00.000Z',
    };

    it('should create a new LLM model successfully', async () => {
      mockPrismaService.llmModel.findFirst.mockResolvedValue(null);
      mockPrismaService.llmModel.create.mockResolvedValue({ id: 'model-1', ...createDto });

      const result = await service.create(createDto);

      expect(mockPrismaService.llmModel.findFirst).toHaveBeenCalled();
      expect(mockPrismaService.llmModel.create).toHaveBeenCalled();
      expect(result).toHaveProperty('id', 'model-1');
    });

    it('should throw ConflictException if model is already active in that date range', async () => {
      mockPrismaService.llmModel.findFirst.mockResolvedValue({ id: 'existing-model' });

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
      expect(mockPrismaService.llmModel.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated models', async () => {
      const query = { provider: 'openai', page: 1, limit: 10 };
      const mockModels = [{ id: 'model-1' }, { id: 'model-2' }];
      
      mockPrismaService.llmModel.findMany.mockResolvedValue(mockModels);
      mockPrismaService.llmModel.count.mockResolvedValue(2);

      const result = await service.findAll(query);

      expect(mockPrismaService.llmModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { provider: 'openai' },
          skip: 0,
          take: 10,
        })
      );
      expect(result.data).toEqual(mockModels);
      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });
  });

  describe('getActiveModels', () => {
    it('should query and return currently active models', async () => {
      const mockModels = [{ id: 'model-1', isActive: true }];
      mockPrismaService.llmModel.findMany.mockResolvedValue(mockModels);

      const result = await service.getActiveModels();

      expect(mockPrismaService.llmModel.findMany).toHaveBeenCalled();
      expect(result).toEqual(mockModels);
    });
  });

  describe('findOne', () => {
    it('should return a model if found', async () => {
        const mockModel = { id: 'model-1', modelName: 'gpt-4' };
        mockPrismaService.llmModel.findUnique.mockResolvedValue(mockModel);

        const result = await service.findOne('model-1');

        expect(mockPrismaService.llmModel.findUnique).toHaveBeenCalledWith({ where: { id: 'model-1' } });
        expect(result).toEqual(mockModel);
    });

    it('should throw NotFoundException if not found', async () => {
        mockPrismaService.llmModel.findUnique.mockResolvedValue(null);

        await expect(service.findOne('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getModel', () => {
    it('should query active model by name sorting by effectiveFrom desc', async () => {
        const mockModel = { id: 'm1', modelName: 'claude-3' };
        mockPrismaService.llmModel.findFirst.mockResolvedValue(mockModel);

        const result = await service.getModel('claude-3');
        
        expect(mockPrismaService.llmModel.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    modelName: 'claude-3',
                    isActive: true
                }),
                orderBy: { effectiveFrom: 'desc' }
            })
        )
        expect(result).toEqual(mockModel);
    });
  });

  describe('update', () => {
      it('should update model if it exists', async () => {
          mockPrismaService.llmModel.findUnique.mockResolvedValue({ id: 'm1' });
          mockPrismaService.llmModel.update.mockResolvedValue({ id: 'm1', notes: 'updated' });

          const result = await service.update('m1', { notes: 'updated' });

          expect(mockPrismaService.llmModel.update).toHaveBeenCalledWith(
              expect.objectContaining({ where: { id: 'm1' } })
          );
          expect(result.notes).toBe('updated');
      });

      it('should throw NotFoundException if model does not exist', async () => {
          mockPrismaService.llmModel.findUnique.mockResolvedValue(null);

          await expect(service.update('invalid', { notes: 'updated' })).rejects.toThrow(NotFoundException);
          expect(mockPrismaService.llmModel.update).not.toHaveBeenCalled();
      });
  });

  describe('delete', () => {
      it('should set isActive to false and update effectiveTo', async () => {
          mockPrismaService.llmModel.findUnique.mockResolvedValue({ id: 'm1', notes: 'original notes' });
          mockPrismaService.llmModel.update.mockResolvedValue({ id: 'm1', isActive: false });

          const result = await service.delete('m1');

          expect(mockPrismaService.llmModel.update).toHaveBeenCalledWith(
              expect.objectContaining({
                  where: { id: 'm1' },
                  data: expect.objectContaining({
                      isActive: false,
                      notes: expect.stringContaining('original notes | Desactivado:')
                  })
              })
          );
          expect(result.isActive).toBe(false);
      });
  });

  describe('calculateCost', () => {
      it('should calculate cost correctly for an existing model', async () => {
          mockPrismaService.llmModel.findFirst.mockResolvedValue({
              id: 'm1',
              modelName: 'gpt-4o',
              provider: 'openai',
              inputPricePer1m: 5,
              outputPricePer1m: 15,
          });

          const usage = { inputTokens: 1_000_000, outputTokens: 2_000_000, totalTokens: 3_000_000 };
          const result = await service.calculateCost('gpt-4o', usage);

          expect(result).toEqual({
              model: 'gpt-4o',
              provider: 'openai',
              inputCost: 5, // (1M / 1M) * 5
              outputCost: 30, // (2M / 1M) * 15
              totalCost: 35
          });
      });

      it('should use fallback prices if model not found', async () => {
          mockPrismaService.llmModel.findFirst.mockResolvedValue(null);
          
          const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, totalTokens: 2_000_000 };
          const result = await service.calculateCost('unknown-model', usage);

          expect(result.provider).toBe('unknown');
          expect(result.inputCost).toBe(0.15);
          expect(result.outputCost).toBe(0.6);
          expect(result.totalCost).toBe(0.75);
      });

      it('should throw error for invalid token counts', async () => {
          await expect(service.calculateCost('m1', { inputTokens: -10, outputTokens: 5, totalTokens: -5 })).rejects.toThrow('Token counts cannot be negative');
      });
  });

  describe('calculateCostBatch', () => {
      it('should correctly calculate costs for a batch of models', async () => {
          mockPrismaService.llmModel.findMany.mockResolvedValue([
              { modelName: 'model-a', provider: 'prov-a', inputPricePer1m: 2, outputPricePer1m: 4 },
              { modelName: 'model-b', provider: 'prov-b', inputPricePer1m: 1, outputPricePer1m: 2 }
          ]);

          const usages = {
              'model-a': { inputTokens: 500_000, outputTokens: 1_000_000, totalTokens: 1_500_000 },
              'model-b': { inputTokens: 2_000_000, outputTokens: 0, totalTokens: 2_000_000 },
              'unknown-model': { inputTokens: 1_000_000, outputTokens: 1_000_000, totalTokens: 2_000_000 }
          };

          const result = await service.calculateCostBatch(usages);

          expect(result).toHaveLength(3);
          
          const calcA = result.find(c => c.model === 'model-a');
          expect(calcA).toBeDefined();
          expect(calcA!.totalCost).toBe(5); // (0.5 * 2) + (1 * 4) = 1 + 4 = 5

          const calcB = result.find(c => c.model === 'model-b');
          expect(calcB).toBeDefined();
          expect(calcB!.totalCost).toBe(2); // (2 * 1) + 0 = 2

          const calcUnknown = result.find(c => c.model === 'unknown-model');
          expect(calcUnknown).toBeDefined();
          expect(calcUnknown!.provider).toBe('unknown'); // Used fallback
      });

      it('should return empty array if provided empty object', async () => {
          const result = await service.calculateCostBatch({});
          expect(result).toEqual([]);
      });
  });
});
