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
export function summarizeNode(node: any, toolNames?: Map<string, string>): string {
  if (!node) return '';
  const cfg = node.config ?? {};

  switch (node.type) {
    case 'agent': {
      const parts = [`agente: ${node.agent ?? '—'}`];
      if (node.max_iterations > 0) parts.push(`${node.max_iterations} iteraciones`);
      if (node.silent) parts.push('silencioso');
      if (node.output_variable) parts.push(`→ ${node.output_variable}`);
      return parts.join(' · ');
    }

    case 'synthesizer':
      return `agente: ${node.agent ?? 'synthesizer'}`;

    case 'tool': {
      const name = toolNames?.get(cfg.tool_instance) ?? cfg.tool_instance?.slice(0, 8) ?? '—';
      return `${cfg.function ?? '—'} · ${name}`;
    }

    case 'set_variables': {
      const keys = Object.keys(cfg.variables ?? {});
      const parts = [];
      if (keys.length) parts.push(`${keys.length} variable(s): ${keys.slice(0, 3).join(', ')}`);
      if (cfg.append_system_message) parts.push('+ mensaje de sistema');
      return parts.join(' · ') || 'sin cambios';
    }

    case 'condition': {
      if (cfg.mode === 'router') {
        const routes = Object.keys(cfg.routes ?? {}).length;
        return `router · ${routes} ruta(s) · fallback: ${cfg.fallback ?? '—'}`;
      }
      if (cfg.mode === 'rules') {
        return `reglas · ${(cfg.rules ?? []).length} regla(s) · default: ${cfg.default ?? '—'}`;
      }
      const branches = Object.keys(cfg.branches ?? {}).length;
      return `switch sobre ${cfg.source ?? '—'} · ${branches} rama(s)`;
    }

    default: {
      // Tipo desconocido: mostrar sus claves es más útil que no mostrar nada.
      const keys = Object.keys(cfg);
      return keys.length ? `config: ${keys.slice(0, 4).join(', ')}` : 'sin config';
    }
  }
}
