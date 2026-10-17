import { WorkflowConfigValidator } from './workflow-config.validator';
import { PrismaService } from '@/platform/database/prisma.service';
import { AgentsService } from '../agents/agents.service';

/**
 * Capacidades de los modelos (`supportsTemperature`, `allowedParams`).
 *
 * El motor manda `model_params` tal cual al proveedor, así que esta validación es la
 * única barrera entre un config mal armado y un turno que falla en producción (así se
 * rompió el router de RGM con gpt-6-luna + reasoning_effort).
 */
describe('WorkflowConfigValidator — capacidades del modelo', () => {
  const catalog = [
    {
      modelName: 'gpt-5.6-luna',
      effectiveTo: null,
      supportsTemperature: true,
      allowedParams: { reasoning_effort: [] },
    },
    {
      modelName: 'gpt-6-luna',
      effectiveTo: null,
      supportsTemperature: true,
      allowedParams: { reasoning_effort: ['none', 'low', 'medium', 'high'] },
    },
    {
      modelName: 'claude-sonnet-5-5',
      effectiveTo: null,
      supportsTemperature: false,
      allowedParams: {},
    },
  ];

  const build = (rows: unknown[] = catalog) => {
    const prisma = { llmModel: { findMany: jest.fn().mockResolvedValue(rows) } };
    return new WorkflowConfigValidator(
      prisma as unknown as PrismaService,
      {} as unknown as AgentsService,
    );
  };

  // graph.type distinto de pipeline: no consulta el catálogo de nodos del motor.
  const config = (agents: Record<string, unknown>) => ({
    type: 'agent',
    graph: { type: 'react' },
    agents,
  });

  it('acepta la configuración actual de RGM (temperature 1 + reasoning_effort none)', async () => {
    const result = await build().collect(
      config({
        general: {
          model: 'gpt-5.6-luna',
          temperature: 1,
          model_params: { reasoning_effort: 'none' },
        },
      }),
    );

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('rechaza temperature en un modelo que no la acepta', async () => {
    const result = await build().collect(
      config({ default: { model: 'claude-sonnet-5-5', temperature: 0.3 } }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      expect.stringContaining('claude-sonnet-5-5 does not accept temperature'),
    ]);
  });

  it('sin temperature, el mismo modelo pasa', async () => {
    const result = await build().collect(config({ default: { model: 'claude-sonnet-5-5' } }));

    expect(result.valid).toBe(true);
  });

  it('rechaza una llave de model_params que el modelo no declara', async () => {
    const result = await build().collect(
      config({ default: { model: 'claude-sonnet-5-5', model_params: { reasoning_effort: 'none' } } }),
    );

    expect(result.errors).toEqual([
      expect.stringContaining('claude-sonnet-5-5 does not accept model_params.reasoning_effort'),
    ]);
  });

  it('rechaza un valor fuera de la lista permitida', async () => {
    const result = await build().collect(
      config({ router: { model: 'gpt-6-luna', model_params: { reasoning_effort: 'turbo' } } }),
    );

    expect(result.errors).toEqual([
      expect.stringContaining('gpt-6-luna does not accept reasoning_effort="turbo"'),
    ]);
  });

  it('lista vacía en allowedParams acepta cualquier valor', async () => {
    const result = await build().collect(
      config({ default: { model: 'gpt-5.6-luna', model_params: { reasoning_effort: 'xhigh' } } }),
    );

    expect(result.valid).toBe(true);
  });

  it('valida cada fallback con los parámetros del agente', async () => {
    // El fallback se invoca con la misma temperature: si no la acepta, fallaría justo
    // cuando más se necesita.
    const result = await build().collect(
      config({
        default: { model: 'gpt-6-luna', temperature: 1, fallbacks: ['claude-sonnet-5-5'] },
      }),
    );

    expect(result.errors).toEqual([
      expect.stringContaining('claude-sonnet-5-5 does not accept temperature'),
    ]);
  });

  it('rechaza model_params que no sea objeto', async () => {
    const result = await build().collect(
      config({ default: { model: 'gpt-6-luna', model_params: ['reasoning_effort'] } }),
    );

    expect(result.errors).toEqual(['Agent "default": model_params must be an object']);
  });

  it('usa las capacidades de la fila de precio vigente', async () => {
    const result = await build([
      // findMany llega ordenado por effectiveFrom desc: la vigente primero.
      {
        modelName: 'gpt-6-luna',
        effectiveTo: null,
        supportsTemperature: false,
        allowedParams: {},
      },
      {
        modelName: 'gpt-6-luna',
        effectiveTo: new Date('2026-01-01'),
        supportsTemperature: true,
        allowedParams: {},
      },
    ]).collect(config({ default: { model: 'gpt-6-luna', temperature: 1 } }));

    expect(result.errors).toEqual([
      expect.stringContaining('gpt-6-luna does not accept temperature'),
    ]);
  });

  it('un modelo inexistente se reporta antes que las capacidades', async () => {
    const result = await build().collect(
      config({ default: { model: 'gpt-luna', temperature: 1 } }),
    );

    expect(result.errors).toEqual([expect.stringContaining('Invalid models: gpt-luna')]);
  });
});
