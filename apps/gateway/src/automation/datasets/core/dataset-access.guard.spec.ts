import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { DatasetAccessGuard, DatasetRequest } from './dataset-access.guard';
import { DatasetTokenClaims, DatasetTokenService } from './dataset-token.service';

/**
 * El guard hace dos cosas y las dos importan: no deja pasar nada sin `Bearer`, y deja los claims
 * verificados en el request. Ese segundo efecto es de lo que viven los tres handlers —de ahí sacan
 * la organización y el catálogo—, así que si dejara de escribirlos el alcance saldría de otro lado.
 *
 * La criptografía no se prueba aquí sino en `dataset-token.service.spec.ts`, con un JWT real; a este
 * nivel `DatasetTokenService` va mockeado y lo que se comprueba es el cableado.
 */
describe('DatasetAccessGuard', () => {
  const claims: DatasetTokenClaims = {
    organizationId: 'org-1',
    datasetId: 'ds-1',
    workflowId: 'wf-1',
  };

  const mockDatasetTokenService: any = { verify: jest.fn() };

  let guard: DatasetAccessGuard;

  /** Lo mínimo del `ExecutionContext` que toca el guard, más el request para inspeccionarlo después. */
  const contextWith = (headers: Record<string, string>) => {
    const request = { headers } as unknown as DatasetRequest;

    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDatasetTokenService.verify.mockReturnValue(claims);
    guard = new DatasetAccessGuard(mockDatasetTokenService as DatasetTokenService);
  });

  describe('sin credencial utilizable', () => {
    it('rechaza si no viene el header', () => {
      const { context } = contextWith({});

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(mockDatasetTokenService.verify).not.toHaveBeenCalled();
    });

    it('rechaza un esquema que no sea Bearer', () => {
      const { context } = contextWith({ authorization: 'Basic dXNlcjpwYXNz' });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(mockDatasetTokenService.verify).not.toHaveBeenCalled();
    });

    it('rechaza el token pelado, sin el prefijo', () => {
      const { context } = contextWith({ authorization: 'un-token-suelto' });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(mockDatasetTokenService.verify).not.toHaveBeenCalled();
    });
  });

  describe('con un token válido', () => {
    it('le pasa a verify el token sin el prefijo', () => {
      const { context } = contextWith({ authorization: 'Bearer el.token.firmado' });

      guard.canActivate(context);

      expect(mockDatasetTokenService.verify).toHaveBeenCalledWith('el.token.firmado');
    });

    it('deja los claims en el request y deja pasar', () => {
      const { context, request } = contextWith({ authorization: 'Bearer el.token.firmado' });

      expect(guard.canActivate(context)).toBe(true);
      expect(request.datasetClaims).toEqual(claims);
    });
  });

  it('propaga tal cual el rechazo de verify, sin envolverlo', () => {
    // `DatasetTokenService` ya normaliza firma inválida, audience ajeno y expiración a un 401 con su
    // mensaje. Envolverlo aquí solo borraría el motivo.
    const rechazo = new UnauthorizedException('Token de dataset inválido o expirado');
    mockDatasetTokenService.verify.mockImplementation(() => {
      throw rechazo;
    });

    const { context, request } = contextWith({ authorization: 'Bearer caducado' });

    expect(() => guard.canActivate(context)).toThrow(rechazo);
    expect(request.datasetClaims).toBeUndefined();
  });
});
