import { BadRequestException } from '@nestjs/common';
import { WorkflowCategory, getWorkflowMaxTokens } from '@tesseract/types';
import { assertMaxTokensWithinCategory, touchesCategoryCeiling } from './category-token-ceiling';

describe('category-token-ceiling', () => {
  describe('assertMaxTokensWithinCategory', () => {
    it('deja pasar un valor por debajo del techo de su categoría', () => {
      expect(() =>
        assertMaxTokensWithinCategory({
          category: WorkflowCategory.LIGHT,
          maxTokensPerExecution: 10_000,
        }),
      ).not.toThrow();
    });

    it('deja pasar el techo exacto', () => {
      // El límite es inclusivo: configurar justo el máximo de la categoría es válido.
      expect(() =>
        assertMaxTokensWithinCategory({
          category: WorkflowCategory.STANDARD,
          maxTokensPerExecution: getWorkflowMaxTokens(WorkflowCategory.STANDARD),
        }),
      ).not.toThrow();
    });

    it('rechaza el caso que el límite existía para evitar: un LIGHT con 500k', () => {
      expect(() =>
        assertMaxTokensWithinCategory({
          category: WorkflowCategory.LIGHT,
          maxTokensPerExecution: 500_000,
        }),
      ).toThrow(BadRequestException);
    });

    it('dice el valor y el techo en el mensaje, para que sea accionable', () => {
      // Sin los dos números el usuario no sabe a cuánto bajarle.
      expect(() =>
        assertMaxTokensWithinCategory({
          category: WorkflowCategory.LIGHT,
          maxTokensPerExecution: 500_000,
        }),
      ).toThrow(/500000.*LIGHT.*20000/);
    });

    it('aplica el techo de cada categoría, no uno global', () => {
      const overLight = getWorkflowMaxTokens(WorkflowCategory.LIGHT) + 1;

      expect(() =>
        assertMaxTokensWithinCategory({
          category: WorkflowCategory.LIGHT,
          maxTokensPerExecution: overLight,
        }),
      ).toThrow(BadRequestException);

      // El mismo número es válido en ADVANCED: el techo depende de la categoría.
      expect(() =>
        assertMaxTokensWithinCategory({
          category: WorkflowCategory.ADVANCED,
          maxTokensPerExecution: overLight,
        }),
      ).not.toThrow();
    });
  });

  describe('touchesCategoryCeiling', () => {
    it('una edición que no toca ninguno de los dos campos no se valida', () => {
      // Si no, una fila vieja fuera de rango quedaría imposible hasta de renombrar.
      expect(touchesCategoryCeiling({ name: 'otro nombre' } as any)).toBe(false);
    });

    it('detecta que se mandó solo el tope', () => {
      expect(touchesCategoryCeiling({ maxTokensPerExecution: 50_000 })).toBe(true);
    });

    it('detecta que se mandó solo la categoría', () => {
      // Es la puerta de atrás: bajar a LIGHT sin tocar los tokens saca al par de rango.
      expect(touchesCategoryCeiling({ category: 'LIGHT' })).toBe(true);
    });

    it('un cero explícito cuenta como enviado', () => {
      // `!== undefined` y no un chequeo de verdad: 0 es falsy pero sí viene en el DTO.
      expect(touchesCategoryCeiling({ maxTokensPerExecution: 0 })).toBe(true);
    });
  });
});
