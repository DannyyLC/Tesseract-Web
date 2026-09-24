'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Search, Plus, Trash2, ChevronRight, AlertTriangle } from 'lucide-react';
import { PromptEditor } from './prompt-editor';
import {
  deleteAtPath,
  nodesReferencingAgent,
  renameKey,
  setAtPath,
  type WorkflowConfig,
} from '@/lib/workflow-config/config-edit';
import type {
  AdminTenantTool,
  EditorContext,
} from '@/lib/api/endpoints/automation/workflows/workflows-admin-api';
import { btnGhost, inputClass, labelClass } from '@/app/[locale]/admin/_styles';

interface Props {
  config: WorkflowConfig;
  onChange: (next: WorkflowConfig) => void;
  models: EditorContext['models'];
  tenantTools: AdminTenantTool[];
}

export function AgentsTab({ config, onChange, models, tenantTools }: Props) {
  const t = useTranslations('Admin.AgentsTab');
  const agents: Record<string, any> = config.agents ?? {};
  const agentKeys = useMemo(() => Object.keys(agents), [agents]);

  const [selected, setSelected] = useState(agentKeys[0] ?? '');
  const [filter, setFilter] = useState('');
  const [renaming, setRenaming] = useState('');

  // `useState` solo corre al montar, así que editar `agents` desde la pestaña de JSON
  // crudo dejaba la selección apuntando a un agente inexistente y el panel vacío sin
  // explicar por qué. Cae al primero disponible.
  useEffect(() => {
    if (agentKeys.length === 0) return;
    if (!agentKeys.includes(selected)) setSelected(agentKeys[0]);
  }, [agentKeys, selected]);

  const current = agents[selected];

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return agentKeys;
    return agentKeys.filter(
      (k) =>
        k.toLowerCase().includes(q) ||
        (agents[k]?.system_prompt ?? '').toLowerCase().includes(q),
    );
  }, [agentKeys, agents, filter]);

  const toolNames = useMemo(
    () => new Map(tenantTools.map((tool) => [tool.id, tool.displayName])),
    [tenantTools],
  );

  /** Cada control escribe una ruta concreta; el resto del documento no se toca. */
  const setField = (field: string, value: unknown) =>
    onChange(setAtPath(config, ['agents', selected, field], value));

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
      const index = (next_config.graph?.nodes ?? []).findIndex((n: any) => n.id === nodeId);
      if (index >= 0) next_config = setAtPath(next_config, ['graph', 'nodes', index, 'agent'], next);
    });

    onChange(next_config);
    setSelected(next);
    setRenaming('');
    if (referencing.length) {
      toast.success(t('agentRenamedWithNodes', { count: referencing.length }));
    }
  };

  const handleAdd = () => {
    let name = 'agente_nuevo';
    let i = 2;
    while (agents[name]) name = `agente_nuevo_${i++}`;
    onChange(
      setAtPath(config, ['agents', name], {
        model: models[0]?.modelName ?? '',
        temperature: 0.7,
        system_prompt: '',
      }),
    );
    setSelected(name);
  };

  const handleDelete = (key: string) => {
    const referencing = nodesReferencingAgent(config, key);
    if (referencing.length) {
      toast.error(t('cannotDeleteInUse', { nodes: referencing.join(', ') }));
      return;
    }
    onChange(deleteAtPath(config, ['agents', key]));
    setSelected(agentKeys.find((k) => k !== key) ?? '');
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
      <div className="flex flex-col rounded-lg border border-border">
        <div className="relative border-b border-border p-2">
          <Search
            size={14}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary"
          />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('searchAgentPlaceholder')}
            className="w-full rounded-md border border-border bg-surface py-1.5 pl-7 pr-2 text-xs text-text-primary outline-none focus:border-border-focus"
          />
        </div>

        <ul className="max-h-[560px] overflow-y-auto">
          {visible.map((key) => (
            <li key={key}>
              <button
                onClick={() => setSelected(key)}
                className={`flex w-full items-start gap-2 border-b border-border px-3 py-2 text-left transition-colors last:border-0 ${
                  selected === key ? 'bg-surface-secondary' : 'hover:bg-surface-secondary'
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
          className="flex items-center justify-center gap-1 border-t border-border py-2 text-xs text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
        >
          <Plus size={13} /> {t('addAgent')}
        </button>
      </div>

      {/* Panel de edición */}
      {current ? (
        <div className="space-y-4 rounded-lg border border-border p-4">
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
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs text-danger transition-colors hover:bg-surface-secondary"
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
                onChange={(e) => setField('model', e.target.value)}
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
                {t('temperatureLabel')} <span className="font-normal">{t('temperatureHint')}</span>
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                className={inputClass}
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

          <PromptEditor
            value={current.system_prompt ?? ''}
            onChange={(v) => setField('system_prompt', v)}
            placeholder={t('promptPlaceholder')}
          />

          {Array.isArray(current.signal_tools) && current.signal_tools.length > 0 && (
            <details className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-xs font-medium text-text-primary">
                {t('signalToolsSummary', { count: current.signal_tools.length })}
              </summary>
              <div className="mt-3 space-y-3">
                {current.signal_tools.map((signal: any, i: number) => (
                  <div key={i} className="space-y-2 rounded-md border border-border p-2">
                    <div>
                      <label className={labelClass}>name</label>
                      <input
                        className={inputClass}
                        value={signal.name ?? ''}
                        onChange={(e) =>
                          setField(
                            'signal_tools',
                            current.signal_tools.map((s: any, j: number) =>
                              j === i ? { ...s, name: e.target.value } : s,
                            ),
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className={labelClass}>description</label>
                      <textarea
                        rows={2}
                        className={inputClass}
                        value={signal.description ?? ''}
                        onChange={(e) =>
                          setField(
                            'signal_tools',
                            current.signal_tools.map((s: any, j: number) =>
                              j === i ? { ...s, description: e.target.value } : s,
                            ),
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className={labelClass}>response</label>
                      <input
                        className={inputClass}
                        value={signal.response ?? ''}
                        onChange={(e) =>
                          setField(
                            'signal_tools',
                            current.signal_tools.map((s: any, j: number) =>
                              j === i ? { ...s, response: e.target.value } : s,
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {Array.isArray(current.tools) && current.tools.length > 0 && (
            <div className="rounded-lg border border-border p-3">
              <span className="text-xs font-medium text-text-primary">
                {t('toolsSummary', { count: current.tools.length })}
              </span>
              <ul className="mt-2 space-y-1">
                {current.tools.map((tool: any, i: number) => {
                  const id = typeof tool === 'string' ? tool : tool?.id;
                  const known = toolNames.get(id);
                  return (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      <span className={known ? 'text-text-primary' : 'text-danger'}>
                        {known ?? t('toolNotOwned', { id: id?.slice(0, 8) })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border p-8 text-center text-sm text-text-secondary">
          {t('selectAgentPrompt')}
        </div>
      )}
    </div>
  );
}
