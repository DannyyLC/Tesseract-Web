import type { EditorContext } from '@/lib/api/endpoints/automation/workflows/workflows-admin-api';
import { deleteAtPath, setAtPath, type AgentConfig, type WorkflowConfig } from './config-edit';

/**
 * Lo que un modelo del catálogo permite configurar en un agente. Sale de `llm_models`
 * (`supportsTemperature`, `allowedParams`) vía el contexto del editor; es la misma
 * fuente que usa el validador del gateway al guardar, así que lo que el editor ofrece
 * es lo que después se acepta.
 */
export type ModelCapabilities = Pick<
  EditorContext['models'][number],
  'supportsTemperature' | 'allowedParams'
>;

/** Lo que un agente trae y su modelo no acepta. */
export interface IncompatibleFields {
  temperature: boolean;
  /** Llaves de `model_params` no declaradas por el modelo o con un valor fuera de su lista. */
  params: string[];
}

/** Capacidades del modelo, o `null` si no está en el catálogo activo (inactivo o desconocido). */
export function capabilitiesOf(
  models: EditorContext['models'],
  modelName: string | undefined,
): ModelCapabilities | null {
  const model = modelName ? models.find((m) => m.modelName === modelName) : undefined;
  return model
    ? { supportsTemperature: model.supportsTemperature, allowedParams: model.allowedParams }
    : null;
}

/** `model_params` del agente; lo que no sea objeto (JSON libre) se lee como vacío. */
export function modelParamsOf(agent: AgentConfig | undefined): Record<string, unknown> {
  const params = agent?.model_params;
  return typeof params === 'object' && params !== null && !Array.isArray(params)
    ? (params as Record<string, unknown>)
    : {};
}

export function incompatibleFields(
  agent: AgentConfig | undefined,
  capabilities: ModelCapabilities,
): IncompatibleFields {
  const hasTemperature = agent?.temperature !== undefined && agent?.temperature !== null;
  const params = Object.entries(modelParamsOf(agent))
    .filter(([param, value]) => {
      const allowed = capabilities.allowedParams[param];
      // Lista vacía = cualquier valor.
      return !allowed || (allowed.length > 0 && !allowed.includes(String(value)));
    })
    .map(([param]) => param);

  return { temperature: hasTemperature && !capabilities.supportsTemperature, params };
}

/**
 * Quita del agente lo que el modelo no acepta. Si `model_params` queda vacío se borra la
 * llave completa: el motor solo manda parámetros cuando hay alguno.
 */
export function stripIncompatible(
  config: WorkflowConfig,
  agentKey: string,
  capabilities: ModelCapabilities,
): { config: WorkflowConfig; removed: IncompatibleFields } {
  const agent = config.agents?.[agentKey];
  const removed = incompatibleFields(agent, capabilities);

  let next = config;
  if (removed.temperature) next = deleteAtPath(next, ['agents', agentKey, 'temperature']);
  for (const param of removed.params) {
    next = deleteAtPath(next, ['agents', agentKey, 'model_params', param]);
  }
  if (removed.params.length > 0) next = dropEmptyModelParams(next, agentKey);

  return { config: next, removed };
}

/** Escribe `model_params.<param>`. Un valor vacío borra la llave ("sin definir"). */
export function setModelParam(
  config: WorkflowConfig,
  agentKey: string,
  param: string,
  value: string,
): WorkflowConfig {
  if (value === '') {
    return dropEmptyModelParams(
      deleteAtPath(config, ['agents', agentKey, 'model_params', param]),
      agentKey,
    );
  }
  return setAtPath(config, ['agents', agentKey, 'model_params', param], value);
}

function dropEmptyModelParams(config: WorkflowConfig, agentKey: string): WorkflowConfig {
  const agent = config.agents?.[agentKey];
  if (agent?.model_params === undefined) return config;
  return Object.keys(modelParamsOf(agent)).length === 0
    ? deleteAtPath(config, ['agents', agentKey, 'model_params'])
    : config;
}
