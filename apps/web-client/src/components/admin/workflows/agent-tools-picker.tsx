'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, X } from 'lucide-react';
import { DynamicIcon } from '@/components/ui/dynamic-icon';
import type { AgentToolRef } from '@/lib/workflow-config/config-edit';
import type { AdminTenantTool } from '@/lib/api/endpoints/automation/workflows/workflows-admin-api';
import { labelClass } from '@/app/[locale]/admin/_styles';

interface Props {
  tools: AgentToolRef[] | undefined;
  /** Integraciones vinculadas al workflow: las únicas que el agente puede recibir. */
  available: AdminTenantTool[];
  /** `undefined` cuando no queda ninguna: la clave se borra en lugar de dejar `[]`. */
  onChange: (next: AgentToolRef[] | undefined) => void;
}

const refId = (ref: AgentToolRef) => (typeof ref === 'string' ? ref : ref?.id);

/**
 * Asigna al agente las integraciones vinculadas al workflow (`agents[x].tools`).
 *
 * Solo ofrece las vinculadas: una que no lo esté nunca llega al agente aunque el config
 * la nombre. Las que ya están en el config sin vínculo se listan aparte para poder
 * quitarlas.
 */
export function AgentToolsPicker({ tools, available, onChange }: Props) {
  const t = useTranslations('Admin.AgentsTab');
  const current = tools ?? [];
  const assigned = new Set(current.map(refId).filter(Boolean));
  const availableIds = new Set(available.map((tool) => tool.id));
  const orphans = current.filter((ref) => {
    const id = refId(ref);
    return !id || !availableIds.has(id);
  });

  // Una entrada puede ser un objeto con configuración propia, no solo el id. Si se
  // desmarca y se vuelve a marcar, se recupera tal cual en lugar de quedar como id suelto.
  const removed = useRef(new Map<string, AgentToolRef>());

  const commit = (next: AgentToolRef[]) => onChange(next.length > 0 ? next : undefined);

  const toggle = (id: string) => {
    if (assigned.has(id)) {
      const entry = current.find((ref) => refId(ref) === id);
      if (entry !== undefined) removed.current.set(id, entry);
      commit(current.filter((ref) => refId(ref) !== id));
    } else {
      commit([...current, removed.current.get(id) ?? id]);
    }
  };

  const removeOrphan = (ref: AgentToolRef) => commit(current.filter((r) => r !== ref));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={labelClass}>{t('toolsTitle')}</span>
        {available.length > 0 && (
          <span className="text-[11px] text-text-tertiary">
            {t('toolsAssigned', {
              count: available.filter((tool) => assigned.has(tool.id)).length,
              total: available.length,
            })}
          </span>
        )}
      </div>

      {available.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-3 text-xs text-text-secondary">
          {t('noLinkedTools')}
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {available.map((tool) => {
            const checked = assigned.has(tool.id);
            const inputId = `agent-tool-${tool.id}`;
            return (
              <li key={tool.id}>
                <label
                  htmlFor={inputId}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-[var(--surface-tint)]"
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-[var(--accent)]"
                    checked={checked}
                    onChange={() => toggle(tool.id)}
                  />
                  <DynamicIcon
                    name={tool.toolCatalog.icon}
                    size={16}
                    className="shrink-0 text-text-secondary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-text-primary">
                      {tool.displayName}
                    </span>
                    <span className="block truncate text-[11px] text-text-secondary">
                      {tool.toolCatalog.displayName}
                    </span>
                    {tool.status !== 'CONNECTED' && (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-warning-600">
                        <AlertTriangle size={11} />
                        {t('toolNotConnected')}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {orphans.length > 0 && (
        <ul className="mt-2 space-y-1">
          {orphans.map((ref, i) => {
            const id = refId(ref);
            return (
              <li key={`${id ?? 'sin-id'}-${i}`} className="flex items-center gap-2 text-[11px]">
                <span className="text-danger">
                  {t('toolNotLinked', { id: id?.slice(0, 8) ?? '?' })}
                </span>
                <button
                  type="button"
                  onClick={() => removeOrphan(ref)}
                  className="inline-flex items-center gap-0.5 text-text-secondary hover:text-text-primary"
                >
                  <X size={11} /> {t('removeTool')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
