'use client';

import { Bot, Box, GitBranch, Merge, Variable, Wrench, type LucideIcon } from 'lucide-react';

/**
 * Iconos por tipo de nodo.
 *
 * Vive en el front y no en el catálogo del motor a propósito: el motor Python no
 * debería conocer librerías de iconos. El `?? Box` es lo que hace que un tipo de nodo
 * nuevo degrade en vez de romper — se dibuja con icono genérico, conservando el label
 * y la descripción reales que sí vienen del catálogo.
 */
const NODE_ICONS: Record<string, LucideIcon> = {
  agent: Bot,
  tool: Wrench,
  condition: GitBranch,
  set_variables: Variable,
  synthesizer: Merge,
};

export function nodeIcon(type: string): LucideIcon {
  return NODE_ICONS[type] ?? Box;
}

export function NodeIcon({ type, size = 14 }: { type: string; size?: number }) {
  const Icon = nodeIcon(type);
  return <Icon size={size} className="shrink-0" />;
}

/**
 * Resumen legible de un nodo. Un JSON Schema no puede producir "11 rutas, fallback:
 * inject_context", así que esto es necesariamente un caso por tipo — con un fallback
 * genérico para lo que no conocemos.
 *
 * Ojo: los nodos `agent` y `synthesizer` guardan sus propiedades en el nivel superior
 * del nodo; el resto las guarda en `node.config`.
 */
type Translator = (key: string, params?: Record<string, string | number | Date>) => string;

/** `t` es `useTranslations('Admin.NodeSummary')` del caller — esta función no es un componente. */
export function summarizeNode(t: Translator, node: any, toolNames?: Map<string, string>): string {
  if (!node) return '';
  const cfg = node.config ?? {};

  switch (node.type) {
    case 'agent': {
      const parts = [t('agentLabel', { agent: node.agent ?? '—' })];
      if (node.max_iterations > 0) parts.push(t('iterationsCount', { count: node.max_iterations }));
      if (node.silent) parts.push(t('silent'));
      if (node.output_variable) parts.push(t('outputArrow', { variable: node.output_variable }));
      return parts.join(' · ');
    }

    case 'synthesizer':
      return t('agentLabel', { agent: node.agent ?? 'synthesizer' });

    case 'tool': {
      const name = toolNames?.get(cfg.tool_instance) ?? cfg.tool_instance?.slice(0, 8) ?? '—';
      return t('toolSummary', { function: cfg.function ?? '—', name });
    }

    case 'set_variables': {
      const keys = Object.keys(cfg.variables ?? {});
      const parts = [];
      if (keys.length)
        parts.push(t('variablesCount', { count: keys.length, names: keys.slice(0, 3).join(', ') }));
      if (cfg.append_system_message) parts.push(t('appendSystemMessage'));
      return parts.join(' · ') || t('noChanges');
    }

    case 'condition': {
      if (cfg.mode === 'router') {
        const routes = Object.keys(cfg.routes ?? {}).length;
        return t('routerSummary', { count: routes, fallback: cfg.fallback ?? '—' });
      }
      if (cfg.mode === 'rules') {
        return t('rulesSummary', { count: (cfg.rules ?? []).length, default: cfg.default ?? '—' });
      }
      const branches = Object.keys(cfg.branches ?? {}).length;
      return t('switchSummary', { source: cfg.source ?? '—', count: branches });
    }

    default: {
      // Tipo desconocido: mostrar sus claves es más útil que no mostrar nada.
      const keys = Object.keys(cfg);
      return keys.length ? t('configKeys', { keys: keys.slice(0, 4).join(', ') }) : t('noConfig');
    }
  }
}
