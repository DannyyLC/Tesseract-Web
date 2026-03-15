import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { AgentsService } from './agents.service';
import { of, throwError } from 'rxjs';
import { AgentExecutionRequestDto } from './dto';

describe('AgentsService', () => {
  let service: AgentsService;
  let httpService: HttpService;
  let configService: ConfigService;

  const mockHttpService = {
    post: jest.fn(),
    get: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key, defaultValue) => {
      if (key === 'AGENTS_API_URL') return 'http://localhost:8000';
      if (key === 'AGENTS_SERVICE_TIMEOUT') return 30000;
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AgentsService>(AgentsService);
    httpService = module.get<HttpService>(HttpService);
    configService = module.get<ConfigService>(ConfigService);

    // Suppress console output for logger in test execution
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    
    jest.clearAllMocks();
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

    it('should successfully execute agent and return response data', async () => {
      const mockResponse = { data: { conversation_id: 'conv1', messages: ['test'] } };
      mockHttpService.post.mockReturnValue(of(mockResponse));

      const result = await service.execute(mockRequest);

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/agents/execute',
        mockRequest
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should throw REQUEST_TIMEOUT if ETIMEDOUT', async () => {
      const error = new Error('Timeout') as any;
      error.code = 'ETIMEDOUT';
      mockHttpService.post.mockReturnValue(throwError(() => error));

      await expect(service.execute(mockRequest)).rejects.toMatchObject(
        new HttpException('Agent execution timed out', HttpStatus.REQUEST_TIMEOUT)
      );
    });

    it('should throw error from python service if response exists', async () => {
      const error = new Error('Bad Request') as any;
      error.response = { status: 400, data: 'Invalid configuration' };
      mockHttpService.post.mockReturnValue(throwError(() => error));

      await expect(service.execute(mockRequest)).rejects.toMatchObject(
        new HttpException('Invalid configuration', 400)
      );
    });

    it('should throw INTERNAL_SERVER_ERROR for unknown errors', async () => {
      const error = new Error('Unknown stuff');
      mockHttpService.post.mockReturnValue(throwError(() => error));

      await expect(service.execute(mockRequest)).rejects.toMatchObject(
        new HttpException('Failed to communicate with agents service', HttpStatus.INTERNAL_SERVER_ERROR)
      );
    });

    it('should throw SERVICE_UNAVAILABLE if ECONNREFUSED', async () => {
      const error = new Error('Connection refused') as any;
      error.code = 'ECONNREFUSED';
      mockHttpService.post.mockReturnValue(throwError(() => error));

      await expect(service.execute(mockRequest)).rejects.toMatchObject(
        new HttpException('Agents service is not available', HttpStatus.SERVICE_UNAVAILABLE)
      );
    });

  });

});
