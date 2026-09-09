/**
 * Calcula cuánto historial cabe de verdad en una ejecución.
 *
 * `maxHistoryTokens` lo escribe una persona al configurar el workflow y nada
 * comprobaba que ese número le quepa al modelo. La ventana de cada modelo estaba
 * guardada en `llm_models` pero no se consultaba en runtime: se podía pedir 500k de
 * historial a un modelo de 400k, guardarlo sin una queja y funcionar semanas —hasta que
 * una conversación real creciera lo suficiente y el error saliera del proveedor, en
 * producción y a media plática.
 *
 * Manda el más chico de los dos límites. Y del lado del modelo no se usa la ventana
 * entera: ahí también viven el system prompt, las definiciones de las tools y la
 * respuesta que el modelo va a escribir, así que se reserva un margen.
 */

export interface ModelContextWindow {
  modelName: string;
  contextWindow: number;
}

export interface ContextWindowBudgetInput {
  /** El valor que la persona configuró en el workflow. */
  configuredMaxTokens: number;
  /** Ventana de cada modelo del workflow. Vacío = no se pudo resolver ninguna. */
  contextWindows: ModelContextWindow[];
  /** Proporción de la ventana utilizable para historial (0.8 = reservar 20%). */
  marginRatio: number;
}

export interface ContextWindowBudget {
  effectiveMaxTokens: number;
  /** Cuál de los dos límites mandó, para poder loguearlo sin recalcular. */
  boundBy: 'configured' | 'context-window';
  /** El modelo cuya ventana resultó ser la más chica, cuando es el que manda. */
  limitingModel?: string;
}

/**
 * Junta los modelos que una ejecución puede llegar a usar.
 *
 * Incluye los `fallbacks` a propósito: un fallback se usa de verdad cuando el principal
 * falla, así que su ventana ata igual. Dejarlos fuera daría un presupuesto que se
 * desmorona justo en el momento en que algo ya salió mal.
 *
 * Tolerante con la forma del config —devuelve lista vacía en vez de lanzar— porque esto
 * corre en la ruta de ejecución: un config raro no puede tumbar la conversación, y sin
 * modelos el presupuesto simplemente no restringe.
 */
export function collectConfiguredModels(config: unknown): string[] {
  const agents = (config as { agents?: unknown })?.agents;
  if (!agents || typeof agents !== 'object' || Array.isArray(agents)) return [];

  const models = new Set<string>();

  for (const agentConfig of Object.values(agents as Record<string, any>)) {
    if (typeof agentConfig?.model === 'string' && agentConfig.model) {
      models.add(agentConfig.model);
    }
    if (Array.isArray(agentConfig?.fallbacks)) {
      for (const fallback of agentConfig.fallbacks) {
        if (typeof fallback === 'string' && fallback) models.add(fallback);
      }
    }
  }

  return Array.from(models);
}

/**
 * El menor entre lo configurado y (ventana más chica × margen).
 *
 * Sin ventanas resueltas devuelve lo configurado tal cual: es el comportamiento que
 * había antes de esta guarda. Preferimos no restringir a restringir con un número
 * inventado — cortar conversaciones reales por un modelo que no está en `llm_models`
 * sería peor que el problema que se está arreglando. Quien llama lo registra.
 */
export function resolveContextWindowBudget({
  configuredMaxTokens,
  contextWindows,
  marginRatio,
}: ContextWindowBudgetInput): ContextWindowBudget {
  if (contextWindows.length === 0) {
    return { effectiveMaxTokens: configuredMaxTokens, boundBy: 'configured' };
  }

  const smallest = contextWindows.reduce((min, current) =>
    current.contextWindow < min.contextWindow ? current : min,
  );

  const windowBudget = Math.floor(smallest.contextWindow * marginRatio);

  if (windowBudget < configuredMaxTokens) {
    return {
      effectiveMaxTokens: windowBudget,
      boundBy: 'context-window',
      limitingModel: smallest.modelName,
    };
  }

  return { effectiveMaxTokens: configuredMaxTokens, boundBy: 'configured' };
}
