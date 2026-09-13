import { Test, TestingModule } from '@nestjs/testing';
import { DEFAULT_PAGE_SIZE } from '@tesseract/types';
import { HttpStatusCode } from 'axios';
import { Response } from 'express';
import { UsersService } from '../../users.service';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  let controller: UsersController;

  const mockUsersService = { getDashboardData: jest.fn() };

  const mockResponse = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getDashboardData', () => {
    /**
     * Una página vacía tiene que responder 200.
     *
     * Antes devolvía 404, y como los hooks del front van con `retry: false`, filtrar sin
     * coincidencias o pasar de la última página se veía como un fallo en vez de como una lista
     * vacía: el estado vacío de la pantalla no llegaba a mostrarse nunca.
     */
    it('devuelve 200 y una lista vacía cuando no hay coincidencias', async () => {
      const res = mockResponse();
      const empty = {
        items: [],
        nextPageAvailable: false,
        nextCursor: null,
        prevCursor: null,
        pageSize: DEFAULT_PAGE_SIZE,
      };
      mockUsersService.getDashboardData.mockResolvedValue(empty);

      await controller.getDashboardData(
        { organizationId: 'org-1' } as any,
        res,
        null,
        DEFAULT_PAGE_SIZE,
        null,
        'nadie-con-este-nombre',
      );

      expect(res.status).toHaveBeenCalledWith(HttpStatusCode.Ok);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: empty }),
      );
    });
  });
});
