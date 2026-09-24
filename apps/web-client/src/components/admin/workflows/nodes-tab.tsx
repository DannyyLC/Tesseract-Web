'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search, AlertTriangle } from 'lucide-react';
import { NodeIcon, summarizeNode } from './node-presentation';
import { setAtPath, type WorkflowConfig } from '@/lib/workflow-config/config-edit';
import type {
  AdminTenantTool,
  EditorContext,
} from '@/lib/api/endpoints/automation/workflows/workflows-admin-api';
import { monoClass } from '@/app/[locale]/admin/_styles';

interface Props {
  config: WorkflowConfig;
  onChange: (next: WorkflowConfig) => void;
  nodeCatalog: EditorContext['nodeCatalog'];
  tenantTools: AdminTenantTool[];
}

/**
 * Los nodos se editan como JSON, pero acotado a UN nodo a la vez y con el schema del
 * catálogo al lado. Es la diferencia entre buscar dentro de 100 KB y editar 15 líneas.
 */
export function NodesTab({ config, onChange, nodeCatalog, tenantTools }: Props) {
  const tt = useTranslations('Admin.NodesTab');
  const tSummary = useTranslations('Admin.NodeSummary');
  const nodes: any[] = config.graph?.nodes ?? [];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState('');
  const [draftText, setDraftText] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Borrar nodos desde el JSON crudo puede dejar el índice fuera de rango.
  useEffect(() => {
    if (nodes.length > 0 && selectedIndex >= nodes.length) setSelectedIndex(0);
  }, [nodes.length, selectedIndex]);

  const toolNames = useMemo(
    () => new Map(tenantTools.map((t) => [t.id, t.displayName])),
    [tenantTools],
  );

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const indexed = nodes.map((node, index) => ({ node, index }));
    if (!q) return indexed;
    return indexed.filter(
      ({ node }) =>
        node?.id?.toLowerCase().includes(q) ||
        node?.type?.toLowerCase().includes(q) ||
        node?.agent?.toLowerCase().includes(q),
    );
  }, [nodes, filter]);

  const current = nodes[selectedIndex];
  const schema = current && nodeCatalog?.node_types?.[current.type];

  const select = (index: number) => {
    setSelectedIndex(index);
    setDraftText(null);
    setParseError(null);
  };

  const commit = (text: string) => {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setParseError(tt('invalidNodeError'));
        return;
      }
      onChange(setAtPath(config, ['graph', 'nodes', selectedIndex], parsed));
      setDraftText(null);
      setParseError(null);
    } catch (e) {
      setParseError((e as Error).message);
    }
  };

  if (nodes.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-text-secondary">{tt('noNodes')}</p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="flex flex-col rounded-lg border border-border">
        <div className="relative border-b border-border p-2">
          <Search
            size={14}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary"
          />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={tt('searchPlaceholder')}
            className="w-full rounded-md border border-border bg-surface py-1.5 pl-7 pr-2 text-xs text-text-primary outline-none focus:border-border-focus"
          />
        </div>

        <ul className="max-h-[560px] overflow-y-auto">
          {visible.map(({ node, index }) => (
            <li key={node?.id ?? index}>
              <button
                onClick={() => select(index)}
                className={`flex w-full items-start gap-2 border-b border-border px-3 py-2 text-left transition-colors last:border-0 ${
                  selectedIndex === index ? 'bg-surface-secondary' : 'hover:bg-surface-secondary'
                }`}
              >
                <span className="mt-0.5 text-text-secondary">
                  <NodeIcon type={node?.type} />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-text-primary">
                    {node?.id}
                  </span>
                  <span className="block truncate text-[11px] text-text-secondary">
                    {nodeCatalog?.node_types?.[node?.type]?.label ?? node?.type}
                    {' · '}
                    {summarizeNode(tSummary, node, toolNames)}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {current && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <NodeIcon type={current.type} size={16} />
            <span className="font-medium text-text-primary">{current.id}</span>
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-text-secondary">
              {schema?.label ?? current.type}
            </span>
            {!schema && nodeCatalog && (
              <span className="inline-flex items-center gap-1 text-[11px] text-danger">
                <AlertTriangle size={12} /> {tt('unknownTypeWarning')}
              </span>
            )}
          </div>

          {schema?.description && (
            <p className="text-xs text-text-secondary">{schema.description}</p>
          )}

          <div className="grid gap-3 xl:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                {tt('nodeJsonLabel')}
              </label>
              <textarea
                rows={22}
                spellCheck={false}
                className={monoClass}
                value={draftText ?? JSON.stringify(current, null, 2)}
                onChange={(e) => {
                  setDraftText(e.target.value);
                  setParseError(null);
                }}
                onBlur={(e) => commit(e.target.value)}
              />
              {parseError ? (
                <p className="mt-1 text-[11px] text-danger">
                  {tt('invalidJson', { error: parseError })}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-text-secondary">{tt('changesApplyOnBlur')}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                {tt('acceptedFieldsLabel')}
              </label>
              {schema ? (
                <div className="max-h-[430px] overflow-y-auto rounded-lg border border-border p-3">
                  <ul className="space-y-2">
                    {Object.entries<any>(schema.config_schema?.properties ?? {}).map(
                      ([key, prop]) => (
                        <li key={key} className="text-xs">
                          <span className="font-mono text-text-primary">{key}</span>
                          <span className="ml-2 text-text-secondary">{prop.type}</span>
                          {schema.config_schema?.required?.includes(key) && (
                            <span className="ml-2 text-[10px] uppercase text-danger">
                              {tt('required')}
                            </span>
                          )}
                          {prop.enum && (
                            <span className="ml-2 text-text-secondary">
                              ({prop.enum.join(' | ')})
                            </span>
                          )}
                          {prop.description && (
                            <p className="mt-0.5 text-[11px] text-text-secondary">
                              {prop.description}
                            </p>
                          )}
                        </li>
                      ),
                    )}
                  </ul>
                  <p className="mt-3 border-t border-border pt-2 text-[11px] text-text-secondary">
                    {tt('agentSynthesizerHint')}
                  </p>
                </div>
              ) : (
                <p className="rounded-lg border border-border p-3 text-xs text-text-secondary">
                  {tt('engineUnavailable')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
