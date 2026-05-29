import { Test, TestingModule } from '@nestjs/testing';
import {
  InternalServerErrorException,
  Logger,
  RequestTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as grpc from '@grpc/grpc-js';
import { AgentsService } from './agents.service';
import { AgentExecutionRequestDto } from './dto';

describe('AgentsService', () => {
  let service: AgentsService;

  const mockGrpcClient = {
    execute: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key, defaultValue) => {
      if (key === 'AGENTS_GRPC_URL') return 'localhost:50051';
      if (key === 'AGENTS_SERVICE_TIMEOUT') return 30000;
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AgentsService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<AgentsService>(AgentsService);

    // onModuleInit (que crea el cliente gRPC real) no corre en compile();
    // inyectamos un cliente mock directamente.
    (service as any).grpcClient = mockGrpcClient;

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    // Neutraliza los delays de reintento (withRetry usa setTimeout).
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0 as any;
    }) as any);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute', () => {
    const mockRequest = {
      tenant_id: 'org1',
      workflow_id: 'wf1',
      conversation_id: 'conv1',
      agents_config: { models: [] },
    } as unknown as AgentExecutionRequestDto;

    it('should successfully execute agent and return mapped response data', async () => {
      const grpcResponse = {
        conversation_id: 'conv1',
        messages: [{ role: 'assistant', content: 'test' }],
        metadata: { total_tokens: 15 },
      };
      mockGrpcClient.execute.mockImplementation((_req, _meta, _opts, cb) => cb(null, grpcResponse));

      const result = await service.execute(mockRequest);

      expect(mockGrpcClient.execute).toHaveBeenCalled();
      expect(result.conversation_id).toBe('conv1');
      expect(result.messages).toEqual([{ role: 'assistant', content: 'test' }]);
      expect(result.metadata?.total_tokens).toBe(15);
    });

    it('should throw RequestTimeoutException on DEADLINE_EXCEEDED', async () => {
      const error = { code: grpc.status.DEADLINE_EXCEEDED, message: 'deadline' };
      mockGrpcClient.execute.mockImplementation((_req, _meta, _opts, cb) => cb(error));

      await expect(service.execute(mockRequest)).rejects.toBeInstanceOf(RequestTimeoutException);
    });

    it('should throw ServiceUnavailableException on UNAVAILABLE', async () => {
      const error = { code: grpc.status.UNAVAILABLE, message: 'unavailable' };
      mockGrpcClient.execute.mockImplementation((_req, _meta, _opts, cb) => cb(error));

      await expect(service.execute(mockRequest)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('should throw InternalServerErrorException for non-retryable errors', async () => {
      const error = { code: grpc.status.INVALID_ARGUMENT, message: 'Invalid configuration' };
      mockGrpcClient.execute.mockImplementation((_req, _meta, _opts, cb) => cb(error));

      await expect(service.execute(mockRequest)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });
});
