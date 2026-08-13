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

const mockGetIdTokenClient = jest.fn();

jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({
    getIdTokenClient: (...args: unknown[]) => mockGetIdTokenClient(...args),
  })),
}));

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

      await expect(service.execute(mockRequest)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('should throw InternalServerErrorException for non-retryable errors', async () => {
      const error = { code: grpc.status.INVALID_ARGUMENT, message: 'Invalid configuration' };
      mockGrpcClient.execute.mockImplementation((_req, _meta, _opts, cb) => cb(error));

      await expect(service.execute(mockRequest)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  /**
   * El Gateway se identifica ante Cloud Run con un ID token de Google además del secreto
   * compartido. Mientras el servicio de agentes siga aceptando tráfico anónimo la cabecera se
   * ignora, así que nada de esto se nota en producción hasta que se cierra el servicio con
   * IAM — momento en el que un error aquí deja al sistema entero sin agentes. De ahí que la
   * spec cubra también el modo local (sin token) y el manejo del fallo al pedirlo.
   */
  describe('ID token de Cloud Run', () => {
    const AGENTS_URL = 'https://agents-abc123-uc.a.run.app';
    const SECRET = 'secreto-compartido';

    const mockRequest = {
      tenant_id: 'org1',
      workflow_id: 'wf1',
      conversation_id: 'conv1',
    } as unknown as AgentExecutionRequestDto;

    const buildService = async (url: string): Promise<AgentsService> => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AgentsService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: unknown) => {
                if (key === 'AGENTS_GRPC_URL') return url;
                if (key === 'AGENTS_INTERNAL_SECRET') return SECRET;
                if (key === 'AGENTS_SERVICE_TIMEOUT') return 30000;
                return defaultValue;
              }),
            },
          },
        ],
      }).compile();

      const built = module.get<AgentsService>(AgentsService);
      (built as any).grpcClient = mockGrpcClient;
      return built;
    };

    /** Corre un `execute` y devuelve la metadata con la que se llamó al cliente gRPC. */
    const captureMetadata = async (svc: AgentsService): Promise<grpc.Metadata> => {
      let captured!: grpc.Metadata;
      mockGrpcClient.execute.mockImplementation((_req, meta, _opts, cb) => {
        captured = meta;
        cb(null, { conversation_id: 'conv1', messages: [] });
      });
      await svc.execute(mockRequest);
      return captured;
    };

    beforeEach(() => {
      mockGetIdTokenClient.mockResolvedValue({
        getRequestHeaders: jest
          .fn()
          .mockResolvedValue(new Headers({ authorization: 'Bearer fake-id-token' })),
      });
    });

    it('adjunta el ID token cuando la URL es https, con la audiencia normalizada', async () => {
      const svc = await buildService(`${AGENTS_URL}/`);
      const metadata = await captureMetadata(svc);

      // El slash final no puede llegar a la audiencia: Cloud Run la compara literal.
      expect(mockGetIdTokenClient).toHaveBeenCalledWith(AGENTS_URL);
      expect(metadata.get('authorization')).toEqual(['Bearer fake-id-token']);
      expect(metadata.get('x-internal-token')).toEqual([SECRET]);
    });

    it('no lo adjunta en local, donde no hay metadata server', async () => {
      const svc = await buildService('localhost:50051');
      const metadata = await captureMetadata(svc);

      expect(mockGetIdTokenClient).not.toHaveBeenCalled();
      expect(metadata.get('authorization')).toEqual([]);
      // El secreto compartido sigue viajando en los dos modos.
      expect(metadata.get('x-internal-token')).toEqual([SECRET]);
    });

    it('reutiliza el mismo cliente en llamadas sucesivas', async () => {
      // Un cliente nuevo por llamada trae la caché vacía: sería un viaje al metadata server
      // en cada mensaje de cada conversación.
      const svc = await buildService(AGENTS_URL);
      await captureMetadata(svc);
      await captureMetadata(svc);
      await captureMetadata(svc);

      expect(mockGetIdTokenClient).toHaveBeenCalledTimes(1);
    });

    it('vuelve a intentarlo si el primer intento falla', async () => {
      // Memorizar la promesa sin limpiarla al fallar convierte un parpadeo del metadata server
      // en un Gateway que ya nunca manda token, hasta que alguien lo reinicie.
      mockGetIdTokenClient.mockRejectedValueOnce(new Error('metadata server no disponible'));
      const svc = await buildService(AGENTS_URL);

      await expect(svc.execute(mockRequest)).rejects.toBeInstanceOf(InternalServerErrorException);

      const metadata = await captureMetadata(svc);
      expect(mockGetIdTokenClient).toHaveBeenCalledTimes(2);
      expect(metadata.get('authorization')).toEqual(['Bearer fake-id-token']);
    });
  });
});
