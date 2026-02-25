export interface CreateApiKeyDto {
  name: string;
  description?: string;
  workflowId: string;
  expiresAt?: string;
}

export interface UpdateApiKeyDto {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface ApiKeyResponse {
  id: string;
  name: string;
  description?: string;
  apiKey: string;
  isActive: boolean;
  workflowId: string;
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKeyList {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  lastUsedAt?: Date;
  expiresAt?: Date;
  workflowId: string;
  createdAt: Date;
}
