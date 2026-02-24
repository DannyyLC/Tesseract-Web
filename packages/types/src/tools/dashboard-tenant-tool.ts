export interface DashboardTenantToolDto {
  id: string;
  displayName: string;
  status: string;
  isConnected: boolean;
  createdAt: Date;
  toolCatalog: {
    toolName: string;
    displayName: string | null;
    icon: string | null;
    category: string | null;
    provider: string | null;
  };
  allowedFunctions?: any;
}
