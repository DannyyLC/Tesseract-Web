export interface GetToolFunctionDto {
  id: string;
  functionName: string;
  displayName: string;
  description: string;
  category: string;
  isActive: boolean;
  isInBeta: boolean;
  icon: string;
  dangerLevel: string;
}

export interface GetToolsDto {
  id: string;
  toolName: string;
  displayName: string;
  description: string;
  provider: string;
  isActive: boolean;
  isInBeta: boolean;
  icon: string;
  category: string;
  functions: GetToolFunctionDto[];
}

// ─── Tenant Tool DTOs ────────────────────────────────────────────────────────
export interface DashboardTenantToolCatalogDto {
  toolName: string;
  displayName: string;
  icon: string;
  category: string;
  provider: string;
}

export interface DashboardTenantToolDto {
  id: string;
  displayName: string;
  status: string;
  isConnected: boolean;
  createdAt: string;
  allowedFunctions: string[];
  toolCatalog: DashboardTenantToolCatalogDto;
}

export interface CreateTenantToolDto {
  toolCatalogId: string;
  displayName: string;
  config?: Record<string, unknown>;
  allowedFunctions?: string[];
  workflowId?: string;
}

export interface UpdateTenantToolDto {
  displayName?: string;
}

export interface WorkflowIdsDto {
  workflowIds: string[];
}

