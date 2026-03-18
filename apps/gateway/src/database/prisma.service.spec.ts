import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

// We just test the functionality we can easily mock
describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);

    // Mock PrismaClient methods that PrimsmaService uses
    service.$connect = jest.fn();
    service.$disconnect = jest.fn();
    service.$queryRaw = jest.fn();
    service.$on = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should connect to the database', async () => {
      (service.$connect as jest.Mock).mockResolvedValue(undefined);
      (service.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);

      await service.onModuleInit();
      expect(service.$connect).toHaveBeenCalled();
    });

    it('should retry connection on failure and throw if max retries reached', async () => {
      // Mock failure
      (service.$connect as jest.Mock).mockRejectedValue(new Error('Connection Failed'));

      const originalSetTimeout = global.setTimeout;
      global.setTimeout = ((fn: any) => fn()) as any;

      await expect(service.onModuleInit()).rejects.toThrow('Connection Failed');
      
      global.setTimeout = originalSetTimeout;
      expect(service.$connect).toHaveBeenCalledTimes(5);
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect from the database', async () => {
      (service.$disconnect as jest.Mock).mockResolvedValue(undefined);
      await service.onModuleDestroy();
      expect(service.$disconnect).toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('should return true if query succeeds', async () => {
      (service.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
      const isHealthy = await service.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should return false if query fails', async () => {
      (service.$queryRaw as jest.Mock).mockRejectedValue(new Error('DB Error'));
      const isHealthy = await service.healthCheck();
      expect(isHealthy).toBe(false);
    });
  });

  describe('withRetry', () => {
    it('should succeed on first try', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const result = await service.withRetry(operation);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry and succeed', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockResolvedValueOnce('success');
      
      const result = await service.withRetry(operation, 3, 10);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Persistent Fail'));
      await expect(service.withRetry(operation, 3, 10)).rejects.toThrow('Persistent Fail');
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('enableShutdownHooks', () => {
    it('should register beforeExit hook', () => {
      const mockApp = { close: jest.fn().mockResolvedValue(undefined) };
      (service.$on as jest.Mock).mockImplementation((event, callback) => {
        if (event === 'beforeExit') {
          callback();
        }
      });
      
      service.enableShutdownHooks(mockApp);
      expect(service.$on).toHaveBeenCalledWith('beforeExit', expect.any(Function));
      expect(mockApp.close).toHaveBeenCalled();
    });
  });
});
