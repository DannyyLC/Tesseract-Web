'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { NodeIcon } from './node-presentation';
import { lintConfig, type WorkflowConfig } from '@/lib/workflow-config/config-edit';
import type { AdminTenantTool } from '@/lib/api/endpoints/automation/workflows/workflows-admin-api';

interface Props {
  config: WorkflowConfig;
  tenantTools: AdminTenantTool[];
}

/**
 * Vista de solo lectura del flujo. Editar la topología se hace desde Nodos o desde el
 * JSON crudo; aquí lo valioso es ver de un vistazo cómo está conectado y qué está roto.
 */
export function GraphTab({ config, tenantTools }: Props) {
  const t = useTranslations('Admin.GraphTab');
  const tLint = useTranslations('Admin.LintConfig');
  const nodes: any[] = config.graph?.nodes ?? [];
  const edges: any[] = config.graph?.edges ?? [];

  const nodeTypeById = useMemo(
    () => new Map(nodes.map((n) => [n?.id, n?.type])),
    [nodes],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const edge of edges) {
      if (!edge?.from) continue;
      map.set(edge.from, [...(map.get(edge.from) ?? []), edge.to]);
    }
    return Array.from(map.entries());
  }, [edges]);

  const issues = useMemo(
    () => lintConfig(config, tenantTools.map((tool) => tool.id), tLint),
    [config, tenantTools, tLint],
  );

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
        <span>{t('nodesCount', { count: nodes.length })}</span>
        <span>{t('edgesCount', { count: edges.length })}</span>
        <span>{t('typeLabel', { type: config.graph?.type ?? '—' })}</span>
        <span>{t('schemaVersion', { version: config.graph?.schema_version ?? 1 })}</span>
      </div>

      {issues.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-border bg-surface-secondary px-3 py-2 text-xs text-text-primary">
          <CheckCircle2 size={14} className="text-success-500" />
          {t('noIssues')}
        </p>
      ) : (
        <div className="space-y-2">
          {[...errors, ...warnings].map((issue, i) => (
            <p
              key={i}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                issue.severity === 'error'
                  ? 'border-danger/40 text-danger'
                  : 'border-border text-text-secondary'
              }`}
            >
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                {issue.message}
                {issue.location && <span className="opacity-70"> · {issue.location}</span>}
              </span>
            </p>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border">
        <div className="border-b border-border px-3 py-2 text-xs font-medium text-text-primary">
          {t('declaredEdges')}
        </div>
        <ul className="divide-y divide-border">
          {grouped.map(([from, targets]) => (
            <li key={from} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <span className="inline-flex items-center gap-1 font-mono text-text-primary">
                {from !== 'START' && <NodeIcon type={nodeTypeById.get(from)} size={12} />}
                {from}
              </span>
              <ArrowRight size={12} className="text-text-secondary" />
              <span className="flex flex-wrap gap-1">
                {targets.map((to, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded bg-surface-secondary px-1.5 py-0.5 font-mono text-text-primary"
                  >
                    {to !== 'END' && <NodeIcon type={nodeTypeById.get(to)} size={11} />}
                    {to}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {config.graph?.persist_variables?.length > 0 && (
        <div className="rounded-lg border border-border px-3 py-2">
          <span className="text-xs font-medium text-text-primary">{t('persistedVariables')}</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {config.graph.persist_variables.map((v: string) => (
              <span
                key={v}
                className="rounded bg-surface-secondary px-1.5 py-0.5 font-mono text-[11px] text-text-primary"
              >
                {v}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-text-secondary">{t('persistedVariablesHint')}</p>
        </div>
      )}
    </div>
  );
}
