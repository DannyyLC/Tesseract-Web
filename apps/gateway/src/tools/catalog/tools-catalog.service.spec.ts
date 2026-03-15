import { Test, TestingModule } from '@nestjs/testing';
import { ToolsCatalogService } from './tools-catalog.service';
import { PrismaService } from '../../database/prisma.service';
import { CursorPaginatedResponseUtils } from '../../common/responses/cursor-paginated-response';

const mockBuild = jest.fn();
jest.spyOn(CursorPaginatedResponseUtils, 'getInstance').mockReturnValue({
  build: mockBuild,
} as unknown as CursorPaginatedResponseUtils);

describe('ToolsCatalogService', () => {
  let service: ToolsCatalogService;

  const mockPrismaService = {
    toolCatalog: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolsCatalogService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ToolsCatalogService>(ToolsCatalogService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAllToolsWithFunctions', () => {
    it('should return paginated tools', async () => {
      const mockTools = [
        {
          id: 't-1',
          toolName: 'Weather',
          functions: [{ id: 'f-1', functionName: 'get_weather' }],
        },
      ];
      mockPrismaService.toolCatalog.findMany.mockResolvedValue(mockTools);
      mockBuild.mockResolvedValue({ items: mockTools, nextPageAvailable: false });

      await service.getAllToolsWithFunctions(null, 10, 'next');

      expect(mockPrismaService.toolCatalog.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 11,
        cursor: undefined,
        include: { functions: true },
        orderBy: { displayName: 'asc' },
      });
      expect(mockBuild).toHaveBeenCalled();
    });

    it('should apply search filters and prev pagination', async () => {
      mockPrismaService.toolCatalog.findMany.mockResolvedValue([]);
      mockBuild.mockResolvedValue({ items: [], nextPageAvailable: false });

      await service.getAllToolsWithFunctions('cursor-1', 5, 'prev', { search: 'API' });

      expect(mockPrismaService.toolCatalog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { toolName: { contains: 'API', mode: 'insensitive' } },
              { description: { contains: 'API', mode: 'insensitive' } },
              { provider: { contains: 'API', mode: 'insensitive' } },
            ],
          },
          skip: 1,
          take: -6,
          cursor: { id: 'cursor-1' },
        }),
      );
    });
  });
});
