import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';
import { Logger } from '@nestjs/common';

describe('PrismaService', () => {
  let service: PrismaService;

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
      providers: [PrismaService],
    }).compile();

    service = module.get<PrismaService>(PrismaService);

    // Mock de los métodos de PrismaClient
    service.$connect = jest.fn().mockResolvedValue(undefined);
    service.$disconnect = jest.fn().mockResolvedValue(undefined);
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

  describe('constructor', () => {
    it('debería configurar logging para desarrollo', () => {
      // Arrange
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      // Act
      const devService = new PrismaService();

      // Assert
      expect(devService).toBeDefined();

      // Cleanup
      process.env.NODE_ENV = originalEnv;
    });

    it('debería configurar logging para producción', () => {
      // Arrange
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      // Act
      const prodService = new PrismaService();

      // Assert
      expect(prodService).toBeDefined();

      // Cleanup
      process.env.NODE_ENV = originalEnv;
    });
  });
});
