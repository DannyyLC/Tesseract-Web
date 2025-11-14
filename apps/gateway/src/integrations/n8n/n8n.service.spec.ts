import { Test, TestingModule } from '@nestjs/testing';
import { N8nService } from './n8n.service';
import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AxiosError, AxiosResponse } from 'axios';
import {
  N8nWebhookErrorException,
  N8nWebhookTimeoutException,
} from '../../common/exceptions';

describe('N8nService', () => {
  let service: N8nService;
  let httpService: jest.Mocked<HttpService>;

  // Helper function to create real AxiosError instances
  const createAxiosError = (code: string, message: string, response?: any): AxiosError => {
    const error = new AxiosError(message);
    error.code = code;
    error.response = response;
    return error;
  };

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

  const mockWebhookUrl = 'https://n8n.example.com/webhook/test';
  const mockExecutionId = 'exec-123';
  const mockPayload = { data: 'test data' };
  const mockResponse: AxiosResponse = {
    data: { success: true, result: 'processed' },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: {} as any },
  };

  beforeEach(async () => {
    const mockHttpService = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        N8nService,
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<N8nService>(N8nService);
    httpService = module.get(HttpService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================================================
  // EXECUTE WEBHOOK TESTS
  // ============================================================================

  describe('executeWebhook', () => {
    const config = {
      webhookUrl: mockWebhookUrl,
      method: 'POST',
      timeout: 30000,
    };

    it('debería ejecutar webhook exitosamente con POST', async () => {
      // Arrange
      httpService.post.mockReturnValue(of(mockResponse));

      // Act
      const result = await service.executeWebhook(config, mockPayload, mockExecutionId);

      // Assert
      expect(result).toEqual(mockResponse.data);
      expect(httpService.post).toHaveBeenCalledWith(
        mockWebhookUrl,
        mockPayload,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': 'WorkflowGateway/1.0',
            'X-Execution-Id': mockExecutionId,
          }),
          timeout: 30000,
        }),
      );
    });

    it('debería ejecutar webhook con GET', async () => {
      // Arrange
      const getConfig = { ...config, method: 'GET' };
      httpService.get.mockReturnValue(of(mockResponse));

      // Act
      const result = await service.executeWebhook(getConfig, mockPayload, mockExecutionId);

      // Assert
      expect(result).toEqual(mockResponse.data);
      expect(httpService.get).toHaveBeenCalledWith(
        mockWebhookUrl,
        expect.objectContaining({ timeout: 30000 }),
      );
    });

    it('debería ejecutar webhook con PUT', async () => {
      // Arrange
      const putConfig = { ...config, method: 'PUT' };
      httpService.put.mockReturnValue(of(mockResponse));

      // Act
      const result = await service.executeWebhook(putConfig, mockPayload, mockExecutionId);

      // Assert
      expect(result).toEqual(mockResponse.data);
      expect(httpService.put).toHaveBeenCalled();
    });

    it('debería ejecutar webhook con PATCH', async () => {
      // Arrange
      const patchConfig = { ...config, method: 'PATCH' };
      httpService.patch.mockReturnValue(of(mockResponse));

      // Act
      const result = await service.executeWebhook(patchConfig, mockPayload, mockExecutionId);

      // Assert
      expect(result).toEqual(mockResponse.data);
      expect(httpService.patch).toHaveBeenCalled();
    });

    it('debería usar POST por defecto si no se especifica método', async () => {
      // Arrange
      const configWithoutMethod = { webhookUrl: mockWebhookUrl };
      httpService.post.mockReturnValue(of(mockResponse));

      // Act
      await service.executeWebhook(configWithoutMethod, mockPayload, mockExecutionId);

      // Assert
      expect(httpService.post).toHaveBeenCalled();
    });

    it('debería usar timeout por defecto de 30 segundos', async () => {
      // Arrange
      const configWithoutTimeout = { webhookUrl: mockWebhookUrl };
      httpService.post.mockReturnValue(of(mockResponse));

      // Act
      await service.executeWebhook(configWithoutTimeout, mockPayload, mockExecutionId);

      // Assert
      expect(httpService.post).toHaveBeenCalledWith(
        mockWebhookUrl,
        mockPayload,
        expect.objectContaining({ timeout: 30000 }),
      );
    });

    it('debería lanzar error para método HTTP no soportado', async () => {
      // Arrange
      const invalidConfig = { ...config, method: 'DELETE' };

      // Act & Assert
      await expect(
        service.executeWebhook(invalidConfig, mockPayload, mockExecutionId),
      ).rejects.toThrow('Método HTTP no soportado: DELETE');
    });

    it('debería incluir headers personalizados', async () => {
      // Arrange
      const configWithHeaders = {
        ...config,
        headers: { 'X-Custom-Header': 'custom-value' },
      };
      httpService.post.mockReturnValue(of(mockResponse));

      // Act
      await service.executeWebhook(configWithHeaders, mockPayload, mockExecutionId);

      // Assert
      expect(httpService.post).toHaveBeenCalledWith(
        mockWebhookUrl,
        mockPayload,
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'custom-value',
          }),
        }),
      );
    });

    // ============================================================================
    // ERROR HANDLING TESTS
    // ============================================================================

    it('debería lanzar N8nWebhookTimeoutException en timeout', async () => {
      // Arrange
      const timeoutError = createAxiosError('ECONNABORTED', 'timeout of 30000ms exceeded');
      httpService.post.mockReturnValue(throwError(() => timeoutError));

      // Act & Assert
      await expect(
        service.executeWebhook(config, mockPayload, mockExecutionId),
      ).rejects.toThrow(N8nWebhookTimeoutException);
    });

    it('debería lanzar N8nWebhookErrorException en error de conexión', async () => {
      // Arrange
      const connError = createAxiosError('ECONNREFUSED', 'Connection refused');
      httpService.post.mockReturnValue(throwError(() => connError));

      // Act & Assert
      await expect(
        service.executeWebhook(config, mockPayload, mockExecutionId),
      ).rejects.toThrow(N8nWebhookErrorException);
    });

    it('debería lanzar N8nWebhookErrorException en error HTTP 4xx', async () => {
      // Arrange
      const httpError = createAxiosError(
        '',
        'Request failed with status code 404',
        {
          status: 404,
          statusText: 'Not Found',
          data: { error: 'Webhook not found' },
        }
      );
      httpService.post.mockReturnValue(throwError(() => httpError));

      // Act & Assert
      await expect(
        service.executeWebhook(config, mockPayload, mockExecutionId),
      ).rejects.toThrow(N8nWebhookErrorException);
    });

    it('debería lanzar N8nWebhookErrorException en error HTTP 5xx', async () => {
      // Arrange
      const serverError = createAxiosError(
        '',
        'Request failed with status code 500',
        {
          status: 500,
          statusText: 'Internal Server Error',
          data: { error: 'Server error' },
        }
      );
      httpService.post.mockReturnValue(throwError(() => serverError));

      // Act & Assert
      await expect(
        service.executeWebhook(config, mockPayload, mockExecutionId),
      ).rejects.toThrow(N8nWebhookErrorException);
    });

    // ============================================================================
    // RETRY LOGIC TESTS
    // ============================================================================

    it('debería reintentar en caso de error si retryOnFail es true', async () => {
      // Arrange
      const retryConfig = {
        ...config,
        retryOnFail: true,
        maxRetries: 2,
        retryDelay: 100,
      };
      const error = createAxiosError(
        '',
        'Request failed',
        { status: 500, statusText: 'Server Error', data: {} }
      );

      httpService.post
        .mockReturnValueOnce(throwError(() => error))
        .mockReturnValueOnce(throwError(() => error))
        .mockReturnValueOnce(of(mockResponse));

      // Act
      const result = await service.executeWebhook(retryConfig, mockPayload, mockExecutionId);

      // Assert
      expect(result).toEqual(mockResponse.data);
      expect(httpService.post).toHaveBeenCalledTimes(3);
    }, 10000);

    it('no debería reintentar si retryOnFail es false', async () => {
      // Arrange
      const noRetryConfig = {
        ...config,
        retryOnFail: false,
        maxRetries: 2,
      };
      const error = createAxiosError(
        '',
        'Request failed',
        { status: 500, statusText: 'Server Error', data: {} }
      );
      httpService.post.mockReturnValue(throwError(() => error));

      // Act & Assert
      await expect(
        service.executeWebhook(noRetryConfig, mockPayload, mockExecutionId),
      ).rejects.toThrow(N8nWebhookErrorException);
      expect(httpService.post).toHaveBeenCalledTimes(1);
    });

    it('no debería reintentar en caso de timeout', async () => {
      // Arrange
      const retryConfig = {
        ...config,
        retryOnFail: true,
        maxRetries: 2,
      };
      const timeoutError = createAxiosError('ECONNABORTED', 'timeout');
      httpService.post.mockReturnValue(throwError(() => timeoutError));

      // Act & Assert
      await expect(
        service.executeWebhook(retryConfig, mockPayload, mockExecutionId),
      ).rejects.toThrow(N8nWebhookTimeoutException);
      expect(httpService.post).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // VALIDATE WEBHOOK URL TESTS
  // ============================================================================

  describe('validateWebhookUrl', () => {
    it('debería validar URL HTTPS como válida', () => {
      expect(service.validateWebhookUrl('https://n8n.example.com/webhook')).toBe(true);
    });

    it('debería validar URL HTTP como válida', () => {
      expect(service.validateWebhookUrl('http://localhost:5678/webhook')).toBe(true);
    });

    it('debería rechazar URL sin protocolo', () => {
      expect(service.validateWebhookUrl('n8n.example.com/webhook')).toBe(false);
    });

    it('debería rechazar URL con protocolo inválido', () => {
      expect(service.validateWebhookUrl('ftp://n8n.example.com/webhook')).toBe(false);
    });

    it('debería rechazar URL malformada', () => {
      expect(service.validateWebhookUrl('not-a-url')).toBe(false);
    });

    it('debería rechazar URL vacía', () => {
      expect(service.validateWebhookUrl('')).toBe(false);
    });
  });
});
