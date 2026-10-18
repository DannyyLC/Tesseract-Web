import type { EditorContext } from '@/lib/api/endpoints/automation/workflows/workflows-admin-api';
import type { WorkflowConfig } from './config-edit';
import {
  capabilitiesOf,
  incompatibleFields,
  setModelParam,
  stripIncompatible,
  type ModelCapabilities,
} from './model-capabilities';

const models: EditorContext['models'] = [
  {
    id: '1',
    modelName: 'claude-sonnet-5-5',
    provider: 'anthropic',
    tier: 'STANDARD',
    supportsTemperature: false,
    allowedParams: {},
  },
  {
    id: '2',
    modelName: 'gpt-6.1-sol',
    provider: 'openai',
    tier: 'STANDARD',
    supportsTemperature: true,
    allowedParams: { reasoning_effort: ['low', 'medium', 'high', 'xhigh'] },
  },
  {
    id: '3',
    modelName: 'gpt-6-luna',
    provider: 'openai',
    tier: 'BASIC',
    supportsTemperature: true,
    allowedParams: { reasoning_effort: [] },
  },
];

const caps = (name: string) => capabilitiesOf(models, name) as ModelCapabilities;

const configWith = (agent: Record<string, unknown>): WorkflowConfig => ({
  type: 'agent',
  agents: { ventas: { system_prompt: 'SP', ...agent } },
});

describe('capabilitiesOf', () => {
  it('regresa null si el modelo no está en el catálogo', () => {
    expect(capabilitiesOf(models, 'gpt-viejo')).toBeNull();
    expect(capabilitiesOf(models, undefined)).toBeNull();
  });
});

describe('incompatibleFields', () => {
  it('marca temperature si el modelo no la acepta', () => {
    const agent = { model: 'claude-sonnet-5-5', temperature: 0.3 };
    expect(incompatibleFields(agent, caps('claude-sonnet-5-5'))).toEqual({
      temperature: true,
      params: [],
    });
  });

  it('marca las llaves que el modelo no declara y los valores fuera de su lista', () => {
    const agent = { model_params: { reasoning_effort: 'none', top_k: 5 } };
    expect(incompatibleFields(agent, caps('gpt-6.1-sol')).params).toEqual([
      'reasoning_effort',
      'top_k',
    ]);
  });

  it('con lista vacía acepta cualquier valor y no toca lo válido', () => {
    const agent = { temperature: 1, model_params: { reasoning_effort: 'none' } };
    expect(incompatibleFields(agent, caps('gpt-6-luna'))).toEqual({
      temperature: false,
      params: [],
    });
  });
});

describe('stripIncompatible', () => {
  it('quita temperature y model_params incompatibles, y borra model_params si queda vacío', () => {
    const config = configWith({ temperature: 1, model_params: { reasoning_effort: 'none' } });

    const { config: next, removed } = stripIncompatible(config, 'ventas', caps('claude-sonnet-5-5'));

    expect(removed).toEqual({ temperature: true, params: ['reasoning_effort'] });
    expect(next.agents?.ventas).toEqual({ system_prompt: 'SP' });
  });

  it('conserva los parámetros válidos', () => {
    const config = configWith({ model_params: { reasoning_effort: 'high', top_k: 5 } });

    const { config: next } = stripIncompatible(config, 'ventas', caps('gpt-6.1-sol'));

    expect(next.agents?.ventas?.model_params).toEqual({ reasoning_effort: 'high' });
  });

  it('sin nada incompatible regresa el mismo config', () => {
    const config = configWith({ temperature: 1 });
    expect(stripIncompatible(config, 'ventas', caps('gpt-6-luna')).config).toBe(config);
  });
});

describe('setModelParam', () => {
  it('escribe el parámetro aunque el agente no tuviera model_params', () => {
    const next = setModelParam(configWith({}), 'ventas', 'reasoning_effort', 'low');
    expect(next.agents?.ventas?.model_params).toEqual({ reasoning_effort: 'low' });
  });

  it('un valor vacío borra la llave y model_params si queda vacío', () => {
    const config = configWith({ model_params: { reasoning_effort: 'low' } });
    const next = setModelParam(config, 'ventas', 'reasoning_effort', '');
    expect(next.agents?.ventas).toEqual({ system_prompt: 'SP' });
  });
});
