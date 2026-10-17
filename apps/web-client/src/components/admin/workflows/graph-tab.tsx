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
  // Memoizados: `?? []` crearía un arreglo nuevo en cada render y rompería los useMemo.
  const nodes = useMemo(() => config.graph?.nodes ?? [], [config.graph?.nodes]);
  const edges = useMemo(() => config.graph?.edges ?? [], [config.graph?.edges]);

  const nodeTypeById = useMemo(() => new Map(nodes.map((n) => [n?.id, n?.type])), [nodes]);

  const grouped = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const edge of edges) {
      if (!edge?.from || !edge.to) continue;
      map.set(edge.from, [...(map.get(edge.from) ?? []), edge.to]);
    }
    return Array.from(map.entries());
  }, [edges]);

  const issues = useMemo(
    () =>
      lintConfig(
        config,
        tenantTools.map((tool) => tool.id),
        tLint,
      ),
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
        <p className="flex items-center gap-2 rounded-xl bg-[var(--badge-success-bg-solid)] px-4 py-3 text-xs font-medium text-[var(--badge-success-text-solid)]">
          <CheckCircle2 size={14} />
          {t('noIssues')}
        </p>
      ) : (
        <div className="space-y-2">
          {[...errors, ...warnings].map((issue, i) => (
            <p
              key={i}
              className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-xs ${
                issue.severity === 'error'
                  ? 'border-[var(--danger-banner-border)] bg-[var(--danger-banner-bg)] text-[var(--danger-text-adaptive)]'
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

      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-text-primary">
          {t('declaredEdges')}
        </div>
        <ul className="divide-y divide-[var(--border-subtle)]">
          {grouped.map(([from, targets]) => (
            <li key={from} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-xs">
              <span className="inline-flex items-center gap-1 font-mono text-text-primary">
                {from !== 'START' && <NodeIcon type={nodeTypeById.get(from)} size={12} />}
                {from}
              </span>
              <ArrowRight size={12} className="text-text-secondary" />
              <span className="flex flex-wrap gap-1">
                {targets.map((to, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-tint)] px-1.5 py-0.5 font-mono text-text-primary"
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

      {config.graph?.persist_variables && config.graph.persist_variables.length > 0 && (
        <div className="rounded-2xl border border-border px-4 py-3">
          <span className="text-xs font-medium text-text-primary">{t('persistedVariables')}</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {config.graph.persist_variables.map((v) => (
              <span
                key={v}
                className="rounded-md bg-[var(--surface-tint)] px-1.5 py-0.5 font-mono text-[11px] text-text-primary"
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
