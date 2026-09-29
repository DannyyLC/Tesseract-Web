import { Injectable, Logger } from '@nestjs/common';
import { InvalidWorkflowConfigException } from '@/platform/common/exceptions';
import { PrismaService } from '@/platform/database/prisma.service';
import { AgentsService } from '../agents/agents.service';
import { errorMessage } from '@/platform/common/utils/error-message';

/**
 * Validación del `config` de un workflow. Vive aparte de WorkflowsService porque la
 * consumen dos caminos con necesidades distintas:
 *
 * - `assert()` lanza en el primer error — es lo que espera el CRUD de inquilino.
 * - `collect()` acumula todos los errores — el editor de super admin trabaja sobre
 *   documentos de ~100 KB con decenas de agentes y nodos, y arreglar los problemas
 *   de uno en uno sería inviable.
 *
 * Ambos comparten la misma lógica, así que no pueden divergir.
 */
/** Lo que el validador lee de un graph de pipeline antes de comprobar su forma. */
interface RawGraphConfig {
  type?: unknown;
  nodes?: unknown;
  edges?: unknown;
}

/** Config del workflow tal como llega (JSON libre); cada fase comprueba lo que usa. */
interface RawWorkflowConfig {
  type?: unknown;
  graph?: RawGraphConfig | null;
  agents?: unknown;
}

@Injectable()
export class WorkflowConfigValidator {
  private readonly logger = new Logger(WorkflowConfigValidator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentsService: AgentsService,
  ) {}

  /**
   * Valida y lanza con el primer error encontrado.
   * Mantiene el contrato que ya esperaban `create()` y `update()`.
   */
  async assert(config: unknown): Promise<void> {
    const { valid, errors } = await this.collect(config);
    if (!valid) {
      throw new InvalidWorkflowConfigException(errors[0]);
    }
  }

  /**
   * Valida acumulando todos los errores que se puedan detectar.
   *
   * Corre por fases: si una fase estructural falla, las siguientes no se ejecutan
   * porque dependerían de datos que no existen (p.ej. no tiene sentido revisar los
   * nodos si `graph` ni siquiera es un objeto). El primer error de la lista es
   * siempre el mismo que habría lanzado la validación original.
   */
  async collect(rawConfig: unknown): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const done = () => ({ valid: errors.length === 0, errors });

    // --- Fase 1: forma básica del documento ---
    if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
      errors.push('Config must be an object');
      return done();
    }
    // JSON libre: lo que no tenga la forma esperada lo reportan las fases siguientes.
    const config = rawConfig as RawWorkflowConfig;
    if (!config.type) {
      errors.push('Config must have a "type" field');
      return done();
    }

    // Los workflows que no son de tipo 'agent' no tienen más contrato que validar.
    if (config.type !== 'agent') return done();

    // --- Fase 2: estructura de un workflow de agentes ---
    if (!config.graph?.type) {
      errors.push(
        'Agent workflows must have graph.type (react, supervisor, router, sequential, parallel)',
      );
    }
    if (!config.agents || typeof config.agents !== 'object' || Array.isArray(config.agents)) {
      errors.push('Agent workflows must have agents config');
    } else if (Object.keys(config.agents).length === 0) {
      errors.push('Agent workflows must have at least one agent');
    }
    if (errors.length > 0) return done();

    // --- Fase 3: modelos y grafo (independientes entre sí, se acumulan ambos) ---
    errors.push(...(await this.collectModelErrors(config.agents as Record<string, unknown>)));

    if (config.graph?.type === 'pipeline') {
      errors.push(...(await this.collectPipelineErrors(config.graph)));
    }

    return done();
  }

  /**
   * Errores estructurales de un graph_config de pipeline, contrastados contra el
   * catálogo autodescriptivo del motor (GetNodeCatalog). Si el motor no responde, la
   * validación de catálogo se omite con un warning pero la estructural corre igual.
   */
  private async collectPipelineErrors(graph: RawGraphConfig): Promise<string[]> {
    const errors: string[] = [];
    const nodes = (Array.isArray(graph.nodes) ? graph.nodes : []) as {
      id?: string;
      type?: string;
    }[];
    const edges = (Array.isArray(graph.edges) ? graph.edges : []) as {
      from?: string;
      to?: string;
    }[];

    if (nodes.length === 0) errors.push('Pipeline graph must have a non-empty "nodes" list');
    if (edges.length === 0) errors.push('Pipeline graph must have a non-empty "edges" list');
    if (errors.length > 0) return errors;

    const nodeIds = new Set<string>();
    for (const node of nodes) {
      if (!node?.id || !node?.type) {
        errors.push('Every pipeline node needs "id" and "type"');
        continue;
      }
      if (nodeIds.has(node.id)) {
        errors.push(`Duplicate node id: "${node.id}"`);
        continue;
      }
      nodeIds.add(node.id);
    }

    for (const edge of edges) {
      const from = edge?.from;
      const to = edge?.to;
      if (!from || !to) {
        errors.push('Every edge needs "from" and "to"');
        continue;
      }
      if (from !== 'START' && !nodeIds.has(from)) {
        errors.push(`Edge references unknown node: "${from}"`);
      }
      if (to !== 'END' && !nodeIds.has(to)) {
        errors.push(`Edge references unknown node: "${to}"`);
      }
    }

    // Tipos de nodo contra el catálogo del motor (best-effort si el motor está caído)
    try {
      const catalog = await this.agentsService.getNodeCatalog('pipeline');
      const supportedTypes = new Set(Object.keys(catalog?.node_types ?? {}));
      if (supportedTypes.size > 0) {
        for (const node of nodes) {
          if (node?.type && !supportedTypes.has(node.type)) {
            errors.push(
              `Unknown node type "${node.type}" (node "${node.id}"). ` +
                `Supported: ${Array.from(supportedTypes).join(', ')}`,
            );
          }
        }
      }
    } catch (error) {
      this.logger.warn(
        `Node catalog unavailable, skipping catalog validation: ${errorMessage(error)}`,
      );
    }

    return errors;
  }

  /**
   * Todos los modelos referenciados (principal + fallbacks) deben existir en LlmModel
   * y estar activos.
   *
   * Ojo al restaurar una versión vieja: si un modelo fue desactivado desde entonces,
   * este error es legítimo y hay que mostrarlo tal cual, no tratarlo como un fallo
   * interno.
   */
  private async collectModelErrors(agentsConfig: Record<string, unknown>): Promise<string[]> {
    const modelsToValidate = new Set<string>();

    // Forma que se espera de cada agente; la config es JSON libre y se valida aquí mismo.
    const agents = agentsConfig as Record<string, { model?: string; fallbacks?: string[] }>;
    for (const agentConfig of Object.values(agents)) {
      if (agentConfig?.model) modelsToValidate.add(agentConfig.model);
      if (Array.isArray(agentConfig?.fallbacks)) {
        agentConfig.fallbacks.forEach((model: string) => modelsToValidate.add(model));
      }
    }

    if (modelsToValidate.size === 0) {
      return ['At least one agent must have a model specified'];
    }

    const activeModels = await this.prisma.llmModel.findMany({
      where: { isActive: true },
      select: { modelName: true },
    });
    const activeModelNames = new Set(activeModels.map((m) => m.modelName));

    const invalidModels = Array.from(modelsToValidate).filter((m) => !activeModelNames.has(m));
    if (invalidModels.length === 0) return [];

    const availableModels = Array.from(activeModelNames).slice(0, 10).join(', ');
    return [
      `Invalid models: ${invalidModels.join(', ')}. ` +
        `Available models: ${availableModels}${activeModelNames.size > 10 ? '...' : ''}`,
    ];
  }
}
