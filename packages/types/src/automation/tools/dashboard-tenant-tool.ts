export interface DashboardTenantToolDto {
  id: string;
  displayName: string;
  status: string;
  isConnected: boolean;
  createdAt: Date;
  createdByUserId?: string | null;
  toolCatalog: {
    toolName: string;
    displayName: string | null;
    icon: string | null;
    category: string | null;
    provider: string | null;
  };
  allowedFunctions?: any;
}

export interface DashboardTenantToolCatalogDto {
  toolName: string;
  displayName: string;
  icon: string;
  category: string;
  provider: string;
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
