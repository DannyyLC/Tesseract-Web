export interface ToolCatalogFunctionDto {
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
  functions: ToolCatalogFunctionDto[];
}
