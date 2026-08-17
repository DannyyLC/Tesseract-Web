import { collectConfiguredModels, resolveContextWindowBudget } from './context-window-budget';

describe('context-window-budget', () => {
  describe('collectConfiguredModels', () => {
    it('junta el modelo de cada agente, sin repetir', () => {
      const config = {
        agents: {
          router: { model: 'gpt-5.4-mini' },
          ventas: { model: 'gpt-5.6-luna' },
          soporte: { model: 'gpt-5.6-luna' },
        },
      };

      expect(collectConfiguredModels(config).sort()).toEqual(['gpt-5.4-mini', 'gpt-5.6-luna']);
    });

    it('incluye los fallbacks', () => {
      // Un fallback se usa de verdad cuando el principal falla: su ventana ata igual.
      const config = {
        agents: { ventas: { model: 'gpt-5.6-luna', fallbacks: ['gpt-5.4-mini'] } },
      };

      expect(collectConfiguredModels(config).sort()).toEqual(['gpt-5.4-mini', 'gpt-5.6-luna']);
    });

    it('devuelve vacío con un config sin agentes en vez de lanzar', () => {
      // Corre en la ruta de ejecución: un config raro no puede tumbar la conversación.
      expect(collectConfiguredModels({})).toEqual([]);
      expect(collectConfiguredModels(null)).toEqual([]);
      expect(collectConfiguredModels({ agents: [] })).toEqual([]);
      expect(collectConfiguredModels({ agents: { roto: {} } })).toEqual([]);
    });
  });

  describe('resolveContextWindowBudget', () => {
    it('recorta al 80% de la ventana cuando lo configurado no cabe', () => {
      // El caso del punto 3: 500k configurados contra un modelo de 400k.
      const budget = resolveContextWindowBudget({
        configuredMaxTokens: 500_000,
        contextWindows: [{ modelName: 'gpt-5.4-mini', contextWindow: 400_000 }],
        marginRatio: 0.8,
      });

      expect(budget.effectiveMaxTokens).toBe(320_000);
      expect(budget.boundBy).toBe('context-window');
      expect(budget.limitingModel).toBe('gpt-5.4-mini');
    });

    it('respeta lo configurado cuando sí cabe', () => {
      const budget = resolveContextWindowBudget({
        configuredMaxTokens: 100_000,
        contextWindows: [{ modelName: 'gpt-5.4-mini', contextWindow: 400_000 }],
        marginRatio: 0.8,
      });

      expect(budget.effectiveMaxTokens).toBe(100_000);
      expect(budget.boundBy).toBe('configured');
    });

    it('manda la ventana MÁS CHICA entre varios modelos', () => {
      // El router del RGM es el más chico: es el primero que se queda sin espacio.
      const budget = resolveContextWindowBudget({
        configuredMaxTokens: 900_000,
        contextWindows: [
          { modelName: 'gpt-5.6-luna', contextWindow: 1_000_000 },
          { modelName: 'gpt-5.4-mini', contextWindow: 400_000 },
        ],
        marginRatio: 0.8,
      });

      expect(budget.effectiveMaxTokens).toBe(320_000);
      expect(budget.limitingModel).toBe('gpt-5.4-mini');
    });

    it('sin ventanas resueltas no restringe', () => {
      // Preferimos no acotar a acotar con un número inventado: cortar conversaciones
      // reales por un modelo ausente en llm_models sería peor que el problema original.
      const budget = resolveContextWindowBudget({
        configuredMaxTokens: 500_000,
        contextWindows: [],
        marginRatio: 0.8,
      });

      expect(budget.effectiveMaxTokens).toBe(500_000);
      expect(budget.boundBy).toBe('configured');
    });

    it('redondea hacia abajo, nunca hacia arriba', () => {
      // Con 0.8 de 12345 salen 9876. Un techo redondeado hacia arriba no sería techo.
      const budget = resolveContextWindowBudget({
        configuredMaxTokens: 999_999,
        contextWindows: [{ modelName: 'raro', contextWindow: 12_345 }],
        marginRatio: 0.8,
      });

      expect(budget.effectiveMaxTokens).toBe(9_876);
    });
  });
});
