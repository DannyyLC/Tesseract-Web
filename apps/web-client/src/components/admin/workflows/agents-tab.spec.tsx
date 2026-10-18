import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { toast } from 'sonner';
import { AgentsTab } from './agents-tab';
import type { WorkflowConfig } from '@/lib/workflow-config/config-edit';
import type { EditorContext } from '@/lib/api/endpoints/automation/workflows/workflows-admin-api';

// Traductor de prueba: la clave seguida de los valores interpolados.
jest.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${Object.values(params).join(' ')}` : key,
}));

jest.mock('sonner', () => ({
  toast: { info: jest.fn(), error: jest.fn(), success: jest.fn() },
}));

// El editor de prompt no interviene en estas pruebas.
jest.mock('./prompt-editor', () => ({ PromptEditor: () => null }));

/**
 * El editor muestra lo que el modelo del agente permite configurar, con las capacidades
 * del catálogo (las mismas que usa el validador del gateway al guardar).
 */
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

let latest: WorkflowConfig;

function Harness({ agent }: { agent: Record<string, unknown> }) {
  const [config, setConfig] = useState<WorkflowConfig>({
    type: 'agent',
    agents: { ventas: { system_prompt: 'SP', ...agent } },
  });
  latest = config;
  return (
    <AgentsTab
      config={config}
      onChange={(next) => {
        latest = next;
        setConfig(next);
      }}
      models={models}
      tenantTools={[]}
    />
  );
}

const temperatureInput = () => screen.getByRole('spinbutton');

beforeEach(() => jest.clearAllMocks());

describe('AgentsTab — capacidades del modelo', () => {
  it('deshabilita temperature y lo avisa si el modelo no la acepta', () => {
    render(<Harness agent={{ model: 'claude-sonnet-5-5' }} />);

    expect(temperatureInput()).toBeDisabled();
    expect(screen.getByText('temperatureUnsupported')).toBeInTheDocument();
    expect(screen.queryByText('modelParamsTitle')).not.toBeInTheDocument();
  });

  it('ofrece un selector con los valores que declara el modelo y escribe model_params', async () => {
    render(<Harness agent={{ model: 'gpt-6.1-sol' }} />);

    expect(temperatureInput()).toBeEnabled();
    const select = screen.getByLabelText('reasoning_effort');
    expect(
      Array.from((select as HTMLSelectElement).options).map((o) => o.value),
    ).toEqual(['', 'low', 'medium', 'high', 'xhigh']);

    await userEvent.selectOptions(select, 'high');

    expect(latest.agents?.ventas?.model_params).toEqual({ reasoning_effort: 'high' });
  });

  it('con lista vacía ofrece un campo de texto libre', () => {
    render(<Harness agent={{ model: 'gpt-6-luna', model_params: { reasoning_effort: 'none' } }} />);

    const input = screen.getByLabelText('reasoning_effort');
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveValue('none');
  });

  it('al cambiar a un modelo que no los acepta quita temperature y model_params y lo avisa', async () => {
    render(
      <Harness
        agent={{ model: 'gpt-6-luna', temperature: 1, model_params: { reasoning_effort: 'none' } }}
      />,
    );

    await userEvent.selectOptions(screen.getByDisplayValue(/gpt-6-luna/), 'claude-sonnet-5-5');

    expect(latest.agents?.ventas).toEqual({ system_prompt: 'SP', model: 'claude-sonnet-5-5' });
    expect(toast.info).toHaveBeenCalledWith(
      expect.stringContaining('temperature, model_params.reasoning_effort'),
    );
  });

  it('un config viejo con valores no aceptados se avisa y se quita solo al pedirlo', async () => {
    render(<Harness agent={{ model: 'gpt-6.1-sol', model_params: { reasoning_effort: 'none' } }} />);

    // Abrir el editor no modifica el config.
    expect(latest.agents?.ventas?.model_params).toEqual({ reasoning_effort: 'none' });
    expect(screen.getByText(/notAcceptedByModel/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'removeNotAccepted' }));

    expect(latest.agents?.ventas?.model_params).toBeUndefined();
  });
});
