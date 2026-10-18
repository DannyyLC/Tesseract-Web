'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Search, Plus, Trash2, ChevronRight, AlertTriangle } from 'lucide-react';
import { PromptEditor } from './prompt-editor';
import { Modal } from '@/components/ui/modal';
import {
  deleteAtPath,
  nodesReferencingAgent,
  renameKey,
  setAtPath,
  type SignalTool,
  type WorkflowConfig,
} from '@/lib/workflow-config/config-edit';
import {
  capabilitiesOf,
  incompatibleFields,
  modelParamsOf,
  setModelParam,
  stripIncompatible,
  type IncompatibleFields,
} from '@/lib/workflow-config/model-capabilities';
import type {
  AdminTenantTool,
  EditorContext,
} from '@/lib/api/endpoints/automation/workflows/workflows-admin-api';
import {
  btnGhost,
  inputClass,
  labelClass,
  rowActiveClass,
  rowClass,
} from '@/app/[locale]/admin/_styles';

interface Props {
  config: WorkflowConfig;
  onChange: (next: WorkflowConfig) => void;
  models: EditorContext['models'];
  tenantTools: AdminTenantTool[];
}

export function AgentsTab({ config, onChange, models, tenantTools }: Props) {
  const t = useTranslations('Admin.AgentsTab');
  // Memoizado: `?? {}` crearía un objeto nuevo en cada render y rompería los useMemo de abajo.
  const agents = useMemo(() => config.agents ?? {}, [config.agents]);
  const agentKeys = useMemo(() => Object.keys(agents), [agents]);

  const [selected, setSelected] = useState(agentKeys[0] ?? '');
  const [filter, setFilter] = useState('');
  const [renaming, setRenaming] = useState('');
  // Agente pendiente de confirmar su borrado (el botón ya no borra de inmediato).
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // `useState` solo corre al montar, así que editar `agents` desde la pestaña de JSON
  // crudo dejaba la selección apuntando a un agente inexistente y el panel vacío sin
  // explicar por qué. Cae al primero disponible.
  useEffect(() => {
    if (agentKeys.length === 0) return;
    if (!agentKeys.includes(selected)) setSelected(agentKeys[0]);
  }, [agentKeys, selected]);

  const current = agents[selected];
  // Lo que el modelo del agente permite configurar; null si no está en el catálogo activo.
  const caps = capabilitiesOf(models, current?.model);
  const notAccepted = caps ? incompatibleFields(current, caps) : null;

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return agentKeys;
    return agentKeys.filter(
      (k) =>
        k.toLowerCase().includes(q) || (agents[k]?.system_prompt ?? '').toLowerCase().includes(q),
    );
  }, [agentKeys, agents, filter]);

  const toolNames = useMemo(
    () => new Map(tenantTools.map((tool) => [tool.id, tool.displayName])),
    [tenantTools],
  );

  /** Cada control escribe una ruta concreta; el resto del documento no se toca. */
  const setField = (field: string, value: unknown) =>
    onChange(setAtPath(config, ['agents', selected, field], value));

  const updateSignal = (index: number, patch: Partial<SignalTool>) =>
    setField(
      'signal_tools',
      (current?.signal_tools ?? []).map((s, j) => (j === index ? { ...s, ...patch } : s)),
    );

  const handleRename = () => {
    const next = renaming.trim();
    if (!next || next === selected) return setRenaming('');
    if (agents[next]) {
      toast.error(t('agentAlreadyExists', { name: next }));
      return;
    }

    // Los nodos apuntan al agente por string, sin integridad referencial: renombrar
    // sin actualizarlos deja el workflow roto y solo se nota en producción.
    const referencing = nodesReferencingAgent(config, selected);
    let next_config = setAtPath(config, ['agents'], renameKey(agents, selected, next));

    referencing.forEach((nodeId) => {
      const index = (next_config.graph?.nodes ?? []).findIndex((n) => n.id === nodeId);
      if (index >= 0)
        next_config = setAtPath(next_config, ['graph', 'nodes', index, 'agent'], next);
    });

    onChange(next_config);
    setSelected(next);
    setRenaming('');
    if (referencing.length) {
      toast.success(t('agentRenamedWithNodes', { count: referencing.length }));
    }
  };

  /** Nombres legibles de lo que se quitó o sobra, para toasts y avisos. */
  const fieldNames = (fields: IncompatibleFields) => [
    ...(fields.temperature ? ['temperature'] : []),
    ...fields.params.map((param) => `model_params.${param}`),
  ];

  /**
   * Cambiar de modelo quita lo que el modelo nuevo no acepta: de otro modo el guardado
   * fallaría después por algo que el usuario no ve en el formulario.
   */
  const handleModelChange = (model: string) => {
    let next = setAtPath(config, ['agents', selected, 'model'], model);
    const nextCaps = capabilitiesOf(models, model);
    if (nextCaps) {
      const stripped = stripIncompatible(next, selected, nextCaps);
      next = stripped.config;
      const removed = fieldNames(stripped.removed);
      if (removed.length) toast.info(t('removedOnModelChange', { model, fields: removed.join(', ') }));
    }
    onChange(next);
  };

  /** Quita a mano lo que un config viejo (o editado en JSON) trae y el modelo ya no acepta. */
  const handleRemoveNotAccepted = () => {
    if (caps) onChange(stripIncompatible(config, selected, caps).config);
  };

  const handleAdd = () => {
    let name = 'agente_nuevo';
    let i = 2;
    while (agents[name]) name = `agente_nuevo_${i++}`;
    onChange(
      setAtPath(config, ['agents', name], {
        model: models[0]?.modelName ?? '',
        // Sin temperature: no todos los modelos la aceptan; vacía usa el default del proveedor.
        system_prompt: '',
      }),
    );
    setSelected(name);
  };

  /** Si algún nodo usa el agente no se puede borrar; si no, se pide confirmación. */
  const handleDelete = (key: string) => {
    const referencing = nodesReferencingAgent(config, key);
    if (referencing.length) {
      toast.error(t('cannotDeleteInUse', { nodes: referencing.join(', ') }));
      return;
    }
    setDeleteConfirm(key);
  };

  const confirmDelete = () => {
    if (!deleteConfirm) return;
    onChange(deleteAtPath(config, ['agents', deleteConfirm]));
    setSelected(agentKeys.find((k) => k !== deleteConfirm) ?? '');
    setDeleteConfirm(null);
  };

  if (agentKeys.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-text-secondary">
        {t('noAgentsConfigured')}
        <button className={`${btnGhost} mx-auto mt-4`} onClick={handleAdd}>
          <Plus size={14} /> {t('addAgent')}
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      {/* Lista lateral */}
      <div className="flex flex-col overflow-hidden rounded-2xl border border-border">
        <div className="relative border-b border-border p-2">
          <Search
            size={14}
            className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('searchAgentPlaceholder')}
            className="w-full rounded-full border-none bg-[var(--surface-tint)] py-1.5 pl-8 pr-3 text-xs text-text-primary transition-all placeholder:text-input-placeholder hover:bg-[var(--surface-tint-md)] focus:outline-none focus:ring-2 focus:ring-[var(--border-subtle)]"
          />
        </div>

        <ul className="max-h-[560px] space-y-1 overflow-y-auto p-2">
          {visible.map((key) => (
            <li key={key}>
              <button
                onClick={() => setSelected(key)}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left ${
                  selected === key ? rowActiveClass : rowClass
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-text-primary">
                    {key}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-text-secondary">
                    {(agents[key]?.system_prompt ?? '').slice(0, 80) || t('noPrompt')}
                  </span>
                </div>
                {selected === key && (
                  <ChevronRight size={13} className="mt-0.5 shrink-0 text-text-secondary" />
                )}
              </button>
            </li>
          ))}
          {visible.length === 0 && (
            <li className="px-3 py-4 text-center text-xs text-text-secondary">{t('noMatches')}</li>
          )}
        </ul>

        <button
          onClick={handleAdd}
          className="flex items-center justify-center gap-1 border-t border-border py-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-[var(--surface-tint)] hover:text-text-primary"
        >
          <Plus size={13} /> {t('addAgent')}
        </button>
      </div>

      {/* Panel de edición */}
      {current ? (
        <div className="space-y-4 rounded-2xl border border-border p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="min-w-[200px] flex-1">
              <label className={labelClass}>{t('agentKeyLabel')}</label>
              <input
                className={inputClass}
                value={renaming || selected}
                onChange={(e) => setRenaming(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              />
            </div>
            <button
              onClick={() => handleDelete(selected)}
              className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-medium text-danger-600 transition-colors hover:bg-[var(--danger-tint-hover)]"
            >
              <Trash2 size={13} /> {t('deleteButton')}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>{t('modelLabel')}</label>
              <select
                className={inputClass}
                value={current.model ?? ''}
                onChange={(e) => handleModelChange(e.target.value)}
              >
                {/* Un modelo fuera de la lista haría fallar el guardado; conservarlo
                    visible evita cambiarlo sin querer al abrir el desplegable. */}
                {current.model && !models.some((m) => m.modelName === current.model) && (
                  <option value={current.model}>
                    {current.model}
                    {t('inactiveModelSuffix')}
                  </option>
                )}
                {models.map((m) => (
                  <option key={m.id} value={m.modelName}>
                    {m.modelName} · {m.provider}
                  </option>
                ))}
              </select>
              {current.model && !models.some((m) => m.modelName === current.model) && (
                <p className="mt-1 flex items-start gap-1 text-[11px] text-danger">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  {t('inactiveModelWarning')}
                </p>
              )}
            </div>

            <div>
              <label className={labelClass}>
                {t('temperatureLabel')}{' '}
                <span className="font-normal">
                  {caps?.supportsTemperature === false
                    ? t('temperatureUnsupported')
                    : t('temperatureHint')}
                </span>
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                className={inputClass}
                disabled={caps?.supportsTemperature === false}
                value={current.temperature ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  // Vacío debe BORRAR la clave, no escribir 0: el motor distingue
                  // "sin temperature" de "temperature = 0".
                  if (raw === '') {
                    onChange(deleteAtPath(config, ['agents', selected, 'temperature']));
                  } else {
                    setField('temperature', Number(raw));
                  }
                }}
              />
            </div>
          </div>

          {caps && Object.keys(caps.allowedParams).length > 0 && (
            <div>
              <span className={labelClass}>{t('modelParamsTitle')}</span>
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(caps.allowedParams).map(([param, values]) => {
                  const value = modelParamsOf(current)[param];
                  const text = value === undefined || value === null ? '' : String(value);
                  return (
                    <div key={param}>
                      <label className={labelClass} htmlFor={`model-param-${param}`}>
                        {param}
                      </label>
                      {values.length > 0 ? (
                        <select
                          id={`model-param-${param}`}
                          className={inputClass}
                          value={values.includes(text) ? text : ''}
                          onChange={(e) =>
                            onChange(setModelParam(config, selected, param, e.target.value))
                          }
                        >
                          <option value="">{t('modelParamUnset')}</option>
                          {values.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id={`model-param-${param}`}
                          className={inputClass}
                          value={text}
                          placeholder={t('modelParamUnset')}
                          onChange={(e) =>
                            onChange(setModelParam(config, selected, param, e.target.value.trim()))
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {notAccepted && fieldNames(notAccepted).length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
              <p className="flex items-start gap-1 text-[11px] text-danger">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                {t('notAcceptedByModel', {
                  model: current.model ?? '',
                  fields: fieldNames(notAccepted).join(', '),
                })}
              </p>
              <button type="button" className={btnGhost} onClick={handleRemoveNotAccepted}>
                {t('removeNotAccepted')}
              </button>
            </div>
          )}

          <PromptEditor
            value={current.system_prompt ?? ''}
            onChange={(v) => setField('system_prompt', v)}
            placeholder={t('promptPlaceholder')}
          />

          {Array.isArray(current.signal_tools) && current.signal_tools.length > 0 && (
            <details className="rounded-xl border border-border p-4">
              <summary className="cursor-pointer text-xs font-medium text-text-primary">
                {t('signalToolsSummary', { count: current.signal_tools.length })}
              </summary>
              <div className="mt-3 space-y-3">
                {current.signal_tools.map((signal, i) => (
                  <div key={i} className="space-y-2 rounded-xl border border-border p-3">
                    <div>
                      <label className={labelClass}>name</label>
                      <input
                        className={inputClass}
                        value={signal.name ?? ''}
                        onChange={(e) => updateSignal(i, { name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>description</label>
                      <textarea
                        rows={2}
                        className={inputClass}
                        value={signal.description ?? ''}
                        onChange={(e) => updateSignal(i, { description: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>response</label>
                      <input
                        className={inputClass}
                        value={signal.response ?? ''}
                        onChange={(e) => updateSignal(i, { response: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {Array.isArray(current.tools) && current.tools.length > 0 && (
            <div className="rounded-xl border border-border p-4">
              <span className="text-xs font-medium text-text-primary">
                {t('toolsSummary', { count: current.tools.length })}
              </span>
              <ul className="mt-2 space-y-1">
                {current.tools.map((tool, i) => {
                  const id = typeof tool === 'string' ? tool : tool?.id;
                  const known = id ? toolNames.get(id) : undefined;
                  return (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      <span className={known ? 'text-text-primary' : 'text-danger'}>
                        {known ?? t('toolNotOwned', { id: id?.slice(0, 8) ?? '?' })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-secondary">
          {t('selectAgentPrompt')}
        </div>
      )}

      <AnimatePresence>
        {deleteConfirm && (
          <Modal
            isOpen={!!deleteConfirm}
            onClose={() => setDeleteConfirm(null)}
            title={t('confirmDeleteTitle')}
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-[var(--danger-banner-border)] bg-[var(--danger-banner-bg)] p-4 text-[var(--danger-text-adaptive)]">
                <AlertTriangle size={24} />
                <p className="text-sm font-medium">
                  {t('confirmDeleteBody', { name: deleteConfirm })}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-surface-secondary px-4 py-2 font-medium text-text-primary transition-colors hover:bg-surface-elevated"
                  onClick={() => setDeleteConfirm(null)}
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2 font-medium text-brand-white transition-colors hover:bg-danger-600"
                  onClick={confirmDelete}
                >
                  {t('confirmDeleteButton')}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
