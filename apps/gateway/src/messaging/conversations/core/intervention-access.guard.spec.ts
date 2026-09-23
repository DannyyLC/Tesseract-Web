import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { InterventionAccessGuard, InterventionRequest } from './intervention-access.guard';
import { InterventionTokenClaims, InterventionTokenService } from './intervention-token.service';

/**
 * Mismo criterio que `dataset-access.guard.spec.ts`: el guard no deja pasar nada sin `Bearer` y deja
 * los claims verificados en el request, de donde el controller saca a qué conversación intervenir.
 * La criptografía se prueba en `intervention-token.service.spec.ts`; aquí `InterventionTokenService`
 * va mockeado.
 */
describe('InterventionAccessGuard', () => {
  const claims: InterventionTokenClaims = {
    organizationId: 'org-1',
    conversationId: 'conv-1',
    workflowId: 'wf-1',
  };

  const mockInterventionTokenService: any = { verify: jest.fn() };

  let guard: InterventionAccessGuard;

  const contextWith = (headers: Record<string, string>) => {
    const request = { headers } as unknown as InterventionRequest;

    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockInterventionTokenService.verify.mockReturnValue(claims);
    guard = new InterventionAccessGuard(mockInterventionTokenService as InterventionTokenService);
  });

  describe('sin credencial utilizable', () => {
    it('rechaza si no viene el header', () => {
      const { context } = contextWith({});

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(mockInterventionTokenService.verify).not.toHaveBeenCalled();
    });

    it('rechaza un esquema que no sea Bearer', () => {
      const { context } = contextWith({ authorization: 'Basic dXNlcjpwYXNz' });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(mockInterventionTokenService.verify).not.toHaveBeenCalled();
    });

    it('rechaza el token pelado, sin el prefijo', () => {
      const { context } = contextWith({ authorization: 'un-token-suelto' });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(mockInterventionTokenService.verify).not.toHaveBeenCalled();
    });
  });

  describe('con un token válido', () => {
    it('le pasa a verify el token sin el prefijo', () => {
      const { context } = contextWith({ authorization: 'Bearer el.token.firmado' });

      guard.canActivate(context);

      expect(mockInterventionTokenService.verify).toHaveBeenCalledWith('el.token.firmado');
    });

    it('deja los claims en el request y deja pasar', () => {
      const { context, request } = contextWith({ authorization: 'Bearer el.token.firmado' });

      expect(guard.canActivate(context)).toBe(true);
      expect(request.interventionClaims).toEqual(claims);
    });
  });

  it('propaga tal cual el rechazo de verify, sin envolverlo', () => {
    const rechazo = new UnauthorizedException('Token de intervención inválido o expirado');
    mockInterventionTokenService.verify.mockImplementation(() => {
      throw rechazo;
    });

    const { context, request } = contextWith({ authorization: 'Bearer caducado' });

    expect(() => guard.canActivate(context)).toThrow(rechazo);
    expect(request.interventionClaims).toBeUndefined();
  });
});
