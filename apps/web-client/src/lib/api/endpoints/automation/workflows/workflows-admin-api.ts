import ApiRequestManager from '@/lib/api/api-request-manager';
import { ADMIN_PAGE_SIZE } from '@tesseract/types';
import type { ApiResponse } from '@tesseract/types';

/** El config es un documento abierto a propósito: el editor lo preserva completo. */
export type WorkflowConfig = Record<string, any>;

export interface AdminWorkflowListItem {
  id: string;
  name: string;
  description: string | null;
  category: 'LIGHT' | 'STANDARD' | 'ADVANCED';
  isActive: boolean;
  isPaused: boolean;
  /** Oculto para el cliente, sin costo ni efecto en su organización; solo lo ejecuta super admin. */
  isInternal: boolean;
  version: number;
  totalExecutions: number;
  lastExecutedAt: string | null;
  updatedAt: string;
  deletedAt: string | null;
  organizationId: string;
  organization: { id: string; name: string; slug: string };
  _count: { configVersions: number };
}

export interface AdminTenantTool {
  id: string;
  displayName: string;
  isConnected: boolean;
  status: string;
  allowedFunctions: unknown;
  toolCatalog: {
    id: string;
    toolName: string;
    displayName: string;
    icon: string | null;
    functions: { functionName: string; displayName: string }[];
  };
}

export interface AdminWorkflowDetail extends Omit<AdminWorkflowListItem, '_count'> {
  config: WorkflowConfig;
  /** sha256 del config tal como estaba al cargarlo. Se devuelve al guardar. */
  configHash: string;
  maxHistoryTokens: number;
  timeout: number;
  maxRetries: number;
  tags: { id: string; name: string }[];
  tenantTools: AdminTenantTool[];
  _count: { configVersions: number; executions: number };
}

export interface EditorContext {
  nodeCatalog: {
    graph_type: string;
    schema_version: number;
    node_types: Record<
      string,
      {
        type: string;
        label: string;
        description: string;
        ports: { inputs: string[]; outputs: string[] | string };
        config_schema: Record<string, any>;
      }
    >;
    templates?: Record<string, any>;
    graph_config_keys?: Record<string, string>;
  } | null;
  models: { id: string; modelName: string; provider: string; tier: string }[];
}

export interface WorkflowVersion {
  id: string;
  version: number;
  configHash: string;
  sizeBytes: number;
  isBaseline: boolean;
  note: string | null;
  source: 'BASELINE' | 'ADMIN_UI' | 'RESTORE' | 'CLONE';
  createdById: string | null;
  createdByEmail: string | null;
  createdAt: string;
}

export interface ConfigDiffEntry {
  path: string;
  op: 'added' | 'removed' | 'changed';
  before?: unknown;
  after?: unknown;
  truncated?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface Paginated<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface AdminWorkflowsQuery {
  organizationId?: string;
  search?: string;
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
}

export interface SaveConfigInput {
  config: WorkflowConfig;
  expectedVersion: number;
  /** Detecta cambios hechos por fuera del editor (SQL directo), que no mueven `version`. */
  expectedHash?: string;
  note?: string;
}

export interface SaveConfigResult {
  workflow: { id: string; name: string; version: number; updatedAt: string } | null;
  changed: boolean;
  version: WorkflowVersion | null;
}

export interface CreateWorkflowAdminInput {
  organizationId: string;
  name: string;
  description?: string;
  category: 'LIGHT' | 'STANDARD' | 'ADVANCED';
  maxHistoryTokens: number;
  config: WorkflowConfig;
  note?: string;
  /** Oculto para el cliente, sin costo ni efecto en su organización; solo lo ejecuta super admin. */
  isInternal?: boolean;
}

export interface CloneWorkflowInput {
  targetOrganizationId: string;
  name: string;
  description?: string;
}

export interface CloneWorkflowResult {
  workflow: AdminWorkflowListItem;
  /** UUIDs de tool instances de la org origen: no son válidos en la destino. */
  toolReferences: { id: string; location: string }[];
}

/**
 * Lo que necesita el panel de "Probar" para mostrar el resultado de una ejecución
 * de prueba sin ir a buscarlo a Cloud Logging. Es un subconjunto de lo que devuelve
 * `GET /admin/workflows/test-executions/:id` (el `Execution` completo) — solo se
 * tipan los campos que la UI realmente usa.
 */
export interface AdminTestExecutionDetail {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';
  startedAt: string;
  finishedAt: string | null;
  /** Segundos. */
  duration: number | null;
  error: string | null;
  errorStack: string | null;
  /** Prisma Decimal serializado — puede llegar como string o number según el caso. */
  cost: string | number;
  tokensUsed: number | null;
}

class WorkflowsAdminApi {
  public apiRequestManager: ApiRequestManager;
  private static BASE_URL = '/admin/workflows';

  constructor() {
    this.apiRequestManager = ApiRequestManager.getInstance();
  }

  public async getEditorContext(): Promise<EditorContext> {
    const result = await this.apiRequestManager.get<ApiResponse<EditorContext>>(
      `${WorkflowsAdminApi.BASE_URL}/editor-context`,
    );
    return result.data.data!;
  }

  public async findAll(query: AdminWorkflowsQuery = {}): Promise<Paginated<AdminWorkflowListItem>> {
    const params = new URLSearchParams();
    if (query.organizationId) params.append('organizationId', query.organizationId);
    if (query.search) params.append('search', query.search);
    if (query.includeDeleted !== undefined)
      params.append('includeDeleted', String(query.includeDeleted));
    if (query.page) params.append('page', String(query.page));
    if (query.limit) params.append('limit', String(query.limit));

    const qs = params.toString();
    const result = await this.apiRequestManager.get<ApiResponse<Paginated<AdminWorkflowListItem>>>(
      `${WorkflowsAdminApi.BASE_URL}${qs ? `?${qs}` : ''}`,
    );
    return result.data.data!;
  }

  public async findOne(id: string): Promise<AdminWorkflowDetail> {
    const result = await this.apiRequestManager.get<ApiResponse<AdminWorkflowDetail>>(
      `${WorkflowsAdminApi.BASE_URL}/${id}`,
    );
    return result.data.data!;
  }

  public async validateConfig(id: string, config: WorkflowConfig): Promise<ValidationResult> {
    const result = await this.apiRequestManager.post<ApiResponse<ValidationResult>>(
      `${WorkflowsAdminApi.BASE_URL}/${id}/config/validate`,
      { config },
    );
    return result.data.data!;
  }

  public async saveConfig(id: string, input: SaveConfigInput): Promise<SaveConfigResult> {
    const result = await this.apiRequestManager.put<ApiResponse<SaveConfigResult>>(
      `${WorkflowsAdminApi.BASE_URL}/${id}/config`,
      input,
    );
    return result.data.data!;
  }

  public async updateMeta(id: string, data: Record<string, unknown>): Promise<AdminWorkflowDetail> {
    const result = await this.apiRequestManager.patch<ApiResponse<AdminWorkflowDetail>>(
      `${WorkflowsAdminApi.BASE_URL}/${id}`,
      data,
    );
    return result.data.data!;
  }

  public async listVersions(id: string, page = 1, limit = ADMIN_PAGE_SIZE): Promise<Paginated<WorkflowVersion>> {
    const result = await this.apiRequestManager.get<ApiResponse<Paginated<WorkflowVersion>>>(
      `${WorkflowsAdminApi.BASE_URL}/${id}/versions?page=${page}&limit=${limit}`,
    );
    return result.data.data!;
  }

  public async getVersion(
    id: string,
    versionId: string,
  ): Promise<WorkflowVersion & { config: WorkflowConfig }> {
    const result = await this.apiRequestManager.get<
      ApiResponse<WorkflowVersion & { config: WorkflowConfig }>
    >(`${WorkflowsAdminApi.BASE_URL}/${id}/versions/${versionId}`);
    return result.data.data!;
  }

  public async diffVersion(
    id: string,
    versionId: string,
  ): Promise<{ fromVersion: number; toVersion: number; entries: ConfigDiffEntry[] }> {
    const result = await this.apiRequestManager.get<
      ApiResponse<{ fromVersion: number; toVersion: number; entries: ConfigDiffEntry[] }>
    >(`${WorkflowsAdminApi.BASE_URL}/${id}/versions/${versionId}/diff`);
    return result.data.data!;
  }

  public async restoreVersion(
    id: string,
    versionId: string,
    expectedVersion: number,
    note?: string,
  ): Promise<SaveConfigResult> {
    const result = await this.apiRequestManager.post<ApiResponse<SaveConfigResult>>(
      `${WorkflowsAdminApi.BASE_URL}/${id}/versions/${versionId}/restore`,
      { expectedVersion, note },
    );
    return result.data.data!;
  }

  public async create(data: CreateWorkflowAdminInput): Promise<AdminWorkflowListItem> {
    const result = await this.apiRequestManager.post<ApiResponse<AdminWorkflowListItem>>(
      WorkflowsAdminApi.BASE_URL,
      data,
    );
    return result.data.data!;
  }

  public async clone(id: string, data: CloneWorkflowInput): Promise<CloneWorkflowResult> {
    const result = await this.apiRequestManager.post<ApiResponse<CloneWorkflowResult>>(
      `${WorkflowsAdminApi.BASE_URL}/${id}/clone`,
      data,
    );
    return result.data.data!;
  }

  // Devuelven el `Workflow` base (sin organization/_count/tenantTools/config, a
  // diferencia de findOne()): quien llama solo necesita disparar el refetch, no
  // leer estos campos.
  public async remove(id: string): Promise<{ id: string; deletedAt: string | null }> {
    const result = await this.apiRequestManager.delete<
      ApiResponse<{ id: string; deletedAt: string | null }>
    >(`${WorkflowsAdminApi.BASE_URL}/${id}`);
    return result.data.data!;
  }

  public async restore(id: string): Promise<{ id: string; deletedAt: string | null }> {
    const result = await this.apiRequestManager.post<
      ApiResponse<{ id: string; deletedAt: string | null }>
    >(`${WorkflowsAdminApi.BASE_URL}/${id}/restore`, {});
    return result.data.data!;
  }

  /** Detalle de una ejecución de prueba — para el panel de la pestaña "Probar". */
  public async getTestExecution(
    executionId: string,
    organizationId: string,
  ): Promise<AdminTestExecutionDetail> {
    const result = await this.apiRequestManager.get<ApiResponse<AdminTestExecutionDetail>>(
      `${WorkflowsAdminApi.BASE_URL}/test-executions/${executionId}?organizationId=${organizationId}`,
    );
    return result.data.data!;
  }
}

export default WorkflowsAdminApi;
