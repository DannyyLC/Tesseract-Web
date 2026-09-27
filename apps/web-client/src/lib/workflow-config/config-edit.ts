/**
 * Edición del config de un workflow SIN perder datos.
 *
 * La regla: el documento se carga una vez y cada control muta una ruta concreta.
 * Nunca se reconstruye el objeto a partir de los campos del formulario, porque eso
 * borraría en silencio todo lo que el formulario no conoce — `post_turn_actions`,
 * `variable_reducers`, o cualquier clave que el motor agregue después.
 */

/**
 * Lo que el editor lee del config. Todo lo demás viaja como `unknown` y se preserva sin
 * tocar: el tipo describe las rutas conocidas, no cierra el documento.
 */
export interface GraphNode {
  id: string;
  type?: string;
  /** Clave en `agents`; solo en nodos `agent` y `synthesizer`. */
  agent?: string;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GraphEdge {
  from?: string;
  to?: string;
  [key: string]: unknown;
}

/** Tool de un agente: id suelto o instancia con su configuración. */
export type AgentToolRef = string | { id?: string; [key: string]: unknown };

/** Tool sin efecto que el agente llama para señalar algo (handoff, fin de flujo…). */
export interface SignalTool {
  name?: string;
  description?: string;
  response?: string;
  [key: string]: unknown;
}

export interface AgentConfig {
  model?: string;
  temperature?: number;
  system_prompt?: string;
  tools?: AgentToolRef[];
  signal_tools?: SignalTool[];
  [key: string]: unknown;
}

/** Procesamiento de audio, imagen y video entrante; apagado si falta. */
export interface MediaProcessingConfig {
  audio?: { enabled?: boolean; maxSeconds?: number; [key: string]: unknown };
  image?: { enabled?: boolean; maxBytes?: number; [key: string]: unknown };
  video?: { enabled?: boolean; [key: string]: unknown };
  ocrPrompt?: string;
  /** Textos que recibe el cliente cuando un archivo no se puede procesar. */
  messages?: Record<string, string>;
  [key: string]: unknown;
}

export interface WorkflowConfig {
  graph?: {
    type?: string;
    schema_version?: number;
    nodes?: GraphNode[];
    edges?: GraphEdge[];
    persist_variables?: string[];
    [key: string]: unknown;
  };
  agents?: Record<string, AgentConfig>;
  mediaProcessing?: MediaProcessingConfig;
  [key: string]: unknown;
}

/** Ruta como lista de segmentos: claves de objeto (string) e índices (number). */
export type PathSegment = string | number;

type Container = Record<PathSegment, unknown>;

/** Copia superficial de un nodo del camino, sea objeto o array. */
function shallowCopy(root: object): Container {
  return (Array.isArray(root) ? [...(root as unknown[])] : { ...root }) as Container;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** El config viene de un editor JSON libre: lo que no sea objeto se lee como vacío. */
function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Copia el config cambiando solo el valor en `path`. Clona únicamente los nodos del
 * camino; el resto del árbol se comparte por referencia, que es lo que mantiene
 * barata la edición de un documento de 100 KB.
 */
export function setAtPath<T extends object>(root: T, path: PathSegment[], value: unknown): T {
  if (path.length === 0) return value as T;

  const [head, ...rest] = path;
  const isIndex = typeof head === 'number';
  const container = shallowCopy(root);

  if (rest.length === 0) {
    container[head] = value;
  } else {
    const child = container[head] ?? (typeof rest[0] === 'number' ? [] : {});
    container[head] = setAtPath(child as object, rest, value);
  }

  // Los índices solo son válidos sobre arrays; si el contenedor no lo era, algo se
  // llamó mal y es mejor enterarse aquí que producir un config silenciosamente raro.
  if (isIndex && !Array.isArray(root) && root !== undefined && root !== null) {
    console.warn('setAtPath: índice numérico sobre un valor que no es array', { path });
  }

  return container as T;
}

/** Elimina la clave en `path`. Se usa para campos que deben AUSENTARSE, no quedar en 0 o "". */
export function deleteAtPath<T extends object>(root: T, path: PathSegment[]): T {
  if (path.length === 0) return root;

  const [head, ...rest] = path;
  const container = shallowCopy(root);

  if (rest.length === 0) {
    if (Array.isArray(container)) container.splice(head as number, 1);
    else delete container[head];
    return container as T;
  }

  const child = container[head];
  if (child === undefined) return container as T;
  container[head] = deleteAtPath(child as object, rest);
  return container as T;
}

export function getAtPath(root: unknown, path: PathSegment[]): unknown {
  return path.reduce<unknown>(
    (acc, key) => (acc == null ? undefined : (acc as Container)[key]),
    root,
  );
}

/** Renombra una clave conservando su posición, para que el JSON no se reordene solo. */
export function renameKey<V>(obj: Record<string, V>, from: string, to: string): Record<string, V> {
  if (from === to || !(from in obj)) return obj;
  const next: Record<string, V> = {};
  for (const [key, value] of Object.entries(obj)) {
    next[key === from ? to : key] = value;
  }
  return next;
}

// ---------------------------------------------------------------- diff local

export interface LocalDiffEntry {
  path: string;
  op: 'added' | 'removed' | 'changed';
  before?: unknown;
  after?: unknown;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(record[k])}`)
    .join(',')}}`;
}

export function isEqualConfig(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

/**
 * Compara el documento original contra el borrador. Espeja el diff del servidor para
 * que "Ver cambios" muestre lo mismo antes y después de guardar.
 */
export function diffLocal(before: unknown, after: unknown): LocalDiffEntry[] {
  const out: LocalDiffEntry[] = [];

  const walk = (a: unknown, b: unknown, path: string) => {
    if (stable(a) === stable(b)) return;

    if (isPlainObject(a) && isPlainObject(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const p = path ? `${path}.${key}` : key;
        if (!(key in a)) out.push({ path: p, op: 'added', after: b[key] });
        else if (!(key in b)) out.push({ path: p, op: 'removed', before: a[key] });
        else walk(a[key], b[key], p);
      }
      return;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const p = `${path}[${i}]`;
        if (i >= a.length) out.push({ path: p, op: 'added', after: b[i] });
        else if (i >= b.length) out.push({ path: p, op: 'removed', before: a[i] });
        else walk(a[i], b[i], p);
      }
      return;
    }

    if (a === undefined) out.push({ path, op: 'added', after: b });
    else if (b === undefined) out.push({ path, op: 'removed', before: a });
    else out.push({ path, op: 'changed', before: a, after: b });
  };

  walk(before, after, '');
  return out;
}

// ---------------------------------------------------------------- lint

export interface LintIssue {
  severity: 'error' | 'warning';
  message: string;
  /** Dónde vive el problema, para poder señalarlo en la UI. */
  location?: string;
}

/**
 * Revisa las referencias que el config guarda como texto plano, sin integridad
 * referencial: `node.agent` apunta a una clave de `agents`, y los destinos de las
 * condiciones apuntan a ids de nodo. Romperlas no falla al guardar — falla cuando el
 * bot ya está atendiendo a un cliente.
 *
 * Todo se resuelve contra índices (Set/Map) y en un solo recorrido, así que el costo
 * no se dispara si un workflow crece a cientos de nodos.
 */
type LintTranslator = (key: string, params?: Record<string, string | number>) => string;

/** `t` es `useTranslations('Admin.LintConfig')` del caller — esta función no es un componente. */
export function lintConfig(
  config: WorkflowConfig,
  knownToolInstanceIds: string[] = [],
  t: LintTranslator,
): LintIssue[] {
  const issues: LintIssue[] = [];
  if (!config || typeof config !== 'object') return issues;

  const agentKeys = new Set(Object.keys(config.agents ?? {}));
  const nodes = config.graph?.nodes ?? [];
  const edges = config.graph?.edges ?? [];
  const nodeIds = new Set<string>(nodes.map((n) => n?.id).filter(Boolean));
  const toolIds = new Set(knownToolInstanceIds);

  const checkNode = (target: unknown, location: string) => {
    if (typeof target !== 'string' || !target) return;
    if (target === 'END' || target === 'START') return;
    if (!nodeIds.has(target)) {
      issues.push({ severity: 'error', message: t('nodeMissing', { target }), location });
    }
  };

  for (const node of nodes) {
    const at = t('nodeLocation', { id: node?.id ?? '?' });

    // Los nodos agent y synthesizer llevan `agent` en el nivel superior, no en config.
    if ((node?.type === 'agent' || node?.type === 'synthesizer') && node?.agent) {
      if (!agentKeys.has(node.agent)) {
        issues.push({
          severity: 'error',
          message: t('agentMissing', { agent: node.agent }),
          location: at,
        });
      }
    }

    const cfg = node?.config ?? {};
    if (node?.type === 'condition') {
      for (const target of Object.values(asRecord(cfg.routes))) checkNode(target, `${at} · routes`);
      for (const target of Object.values(asRecord(cfg.branches))) {
        checkNode(target, `${at} · branches`);
      }
      for (const rule of asArray(cfg.rules)) checkNode(asRecord(rule).goto, `${at} · rules`);
      for (const key of ['fallback', 'default', 'lock_node', 'synthesizer_node', 'end_node']) {
        checkNode(cfg[key], `${at} · ${key}`);
      }
    }

    const toolInstance = cfg.tool_instance;
    if (node?.type === 'tool' && typeof toolInstance === 'string' && toolIds.size > 0) {
      if (!toolIds.has(toolInstance)) {
        issues.push({
          severity: 'error',
          message: t('toolNotOwned', { id: toolInstance }),
          location: at,
        });
      }
    }
  }

  for (const [agentKey, agent] of Object.entries(config.agents ?? {})) {
    for (const tool of agent?.tools ?? []) {
      const id = typeof tool === 'string' ? tool : tool?.id;
      if (id && toolIds.size > 0 && !toolIds.has(id)) {
        issues.push({
          severity: 'error',
          message: t('toolNotOwned', { id }),
          location: t('agentLocation', { key: agentKey }),
        });
      }
    }
  }

  // Nodos inalcanzables: no rompen el guardado, pero suelen ser residuo de una edición
  // a medias y conviene verlos.
  const reachable = new Set<string>();
  for (const edge of edges) if (edge?.to) reachable.add(edge.to);
  for (const node of nodes) {
    const cfg = node?.config ?? {};
    if (node?.type !== 'condition') continue;
    for (const target of Object.values(asRecord(cfg.routes))) reachable.add(String(target));
    for (const target of Object.values(asRecord(cfg.branches))) reachable.add(String(target));
    for (const rule of asArray(cfg.rules)) {
      const goto = asRecord(rule).goto;
      if (goto) reachable.add(String(goto));
    }
    for (const key of ['fallback', 'default', 'lock_node', 'synthesizer_node', 'end_node']) {
      if (cfg[key]) reachable.add(String(cfg[key]));
    }
  }
  // Un grafo puede arrancar en varios nodos: tomar solo la primera arista desde START
  // marcaba los demás puntos de entrada como huérfanos.
  const entryNodes = new Set(
    edges.filter((e) => e?.from === 'START' && e?.to).map((e) => e.to as string),
  );
  for (const node of nodes) {
    if (node?.id && !entryNodes.has(node.id) && !reachable.has(node.id)) {
      issues.push({
        severity: 'warning',
        message: t('nodeUnreachable', { id: node.id }),
        location: t('nodeLocation', { id: node.id }),
      });
    }
  }

  const agentsUsed = new Set(nodes.map((n) => n?.agent).filter(Boolean));
  for (const key of agentKeys) {
    if (!agentsUsed.has(key)) {
      issues.push({
        severity: 'warning',
        message: t('agentUnused', { key }),
        location: t('agentLocation', { key }),
      });
    }
  }

  return issues;
}

/** Nodos que referencian un agente, para avisar antes de renombrarlo. */
export function nodesReferencingAgent(config: WorkflowConfig, agentKey: string): string[] {
  return (config.graph?.nodes ?? []).filter((n) => n?.agent === agentKey).map((n) => n.id);
}
