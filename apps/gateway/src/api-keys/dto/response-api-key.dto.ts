export class ApiKeyResponseDto {
  id: string;
  name: string;
  apiKey: string;
  isActive: boolean;
  workflowId: string;
  expiresAt: Date;
  lastUsedAt: Date;
  createdAt: Date;
}

export class ApiKeyListDto {
  id: string;
  name: string;
  isActive: boolean;
  lastUsedAt: Date;
  expiresAt: Date;
  workflowId: string;
  createdAt: Date;
}
