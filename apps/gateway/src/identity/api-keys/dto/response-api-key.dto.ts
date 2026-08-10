export class ApiKeyResponseDto {
  id: string;
  name: string;
  description?: string;
  apiKey: string;
  isActive: boolean;
  workflowId: string;
  workflowName: string;
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class ApiKeyListDto {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  lastUsedAt?: Date;
  expiresAt?: Date;
  workflowId: string;
  /** Nombre del workflow enlazado, resuelto en el gateway. */
  workflowName: string;
  createdAt: Date;
}
