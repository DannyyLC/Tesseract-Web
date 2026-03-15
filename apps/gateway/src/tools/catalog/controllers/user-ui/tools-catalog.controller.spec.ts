import { Test, TestingModule } from '@nestjs/testing';
import { ToolsCatalogController } from './tools-catalog.controller';
import { ToolsCatalogService } from '../../tools-catalog.service';
import { Response } from 'express';
import { HttpStatusCode } from 'axios';

describe('ToolsCatalogController', () => {
  let controller: ToolsCatalogController;

  const mockToolsCatalogService = {
    getAllToolsWithFunctions: jest.fn(),
  };

  const mockResponse = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ToolsCatalogController],
      providers: [
        { provide: ToolsCatalogService, useValue: mockToolsCatalogService },
      ],
    }).compile();

    controller = module.get<ToolsCatalogController>(ToolsCatalogController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAllToolsWithFunctions', () => {
    it('should return empty tools and 404 status', async () => {
      const res = mockResponse();
      mockToolsCatalogService.getAllToolsWithFunctions.mockResolvedValue({
        items: [],
      });

      await controller.getAllToolsWithFunctions(
        res,
        null,
        10,
        null,
        null,
      );

      expect(res.status).toHaveBeenCalledWith(HttpStatusCode.NotFound);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: 'No tools found' }),
      );
    });

    it('should return tools and 200 status', async () => {
      const res = mockResponse();
      mockToolsCatalogService.getAllToolsWithFunctions.mockResolvedValue({
        items: [{ id: 't-1' }],
      });

      await controller.getAllToolsWithFunctions(
        res,
        'cursor-1',
        5,
        'next',
        'searchQuery',
      );

      expect(mockToolsCatalogService.getAllToolsWithFunctions).toHaveBeenCalledWith(
        'cursor-1',
        5,
        'next',
        { search: 'searchQuery' },
      );
      expect(res.status).toHaveBeenCalledWith(HttpStatusCode.Ok);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Tools retrieved successfully' }),
      );
    });
  });
});
