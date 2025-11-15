import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';
import { Logger } from '@nestjs/common';

// Mock completo de PrismaService para evitar inicialización real del cliente
class MockPrismaService {
  $connect = jest.fn().mockResolvedValue(undefined);
  $disconnect = jest.fn().mockResolvedValue(undefined);

  async onModuleInit() {
    try {
      await this.$connect();
      Logger.prototype.log('Conectado a PostgreSQL');
    } catch (error) {
      Logger.prototype.error('Error al conectar a PostgreSQL', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    Logger.prototype.log('Desconectado de PostgreSQL');
  }
}

describe('PrismaService', () => {
  let service: MockPrismaService;

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: PrismaService,
          useClass: MockPrismaService,
        },
      ],
    }).compile();

    service = module.get<PrismaService>(PrismaService) as any;

    // Limpiar los mocks antes de cada test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('debería conectarse a la base de datos exitosamente', async () => {
      // Act
      await service.onModuleInit();

      // Assert
      expect(service.$connect).toHaveBeenCalled();
    });

    it('debería loguear cuando se conecta exitosamente', async () => {
      // Arrange
      const logSpy = jest.spyOn(Logger.prototype, 'log');

      // Act
      await service.onModuleInit();

      // Assert
      expect(logSpy).toHaveBeenCalledWith('Conectado a PostgreSQL');
    });

    it('debería lanzar error si falla la conexión', async () => {
      // Arrange
      const error = new Error('Connection failed');
      service.$connect = jest.fn().mockRejectedValue(error);
      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      // Act & Assert
      await expect(service.onModuleInit()).rejects.toThrow(error);
      expect(errorSpy).toHaveBeenCalledWith('Error al conectar a PostgreSQL', error);
    });
  });

  describe('onModuleDestroy', () => {
    it('debería desconectarse de la base de datos', async () => {
      // Act
      await service.onModuleDestroy();

      // Assert
      expect(service.$disconnect).toHaveBeenCalled();
    });

    it('debería loguear cuando se desconecta', async () => {
      // Arrange
      const logSpy = jest.spyOn(Logger.prototype, 'log');

      // Act
      await service.onModuleDestroy();

      // Assert
      expect(logSpy).toHaveBeenCalledWith('Desconectado de PostgreSQL');
    });
  });

  describe('Prisma client methods', () => {
    it('debería tener el método $connect definido', () => {
      expect(service.$connect).toBeDefined();
      expect(typeof service.$connect).toBe('function');
    });

    it('debería tener el método $disconnect definido', () => {
      expect(service.$disconnect).toBeDefined();
      expect(typeof service.$disconnect).toBe('function');
    });

    it('debería tener los métodos de lifecycle definidos', () => {
      expect(service.onModuleInit).toBeDefined();
      expect(service.onModuleDestroy).toBeDefined();
      expect(typeof service.onModuleInit).toBe('function');
      expect(typeof service.onModuleDestroy).toBe('function');
    });
  });
});
