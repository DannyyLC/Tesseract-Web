// ============================================================
// API Keys
// ============================================================
/** Payload que el frontend envía para crear un API Key */
export interface CreateApiKeyDto {
  name: string;
  description?: string;
  workflowId: string;
  expiresAt?: string; // ISO 8601
}

/** Payload que el frontend envía para actualizar un API Key */
export interface UpdateApiKeyDto {
  name?: string;
  description?: string;
  isActive?: boolean;
}

/** Shape de un API Key en listados */
export interface ApiKeyListDto {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  workflowId: string;
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
}

/**
 * Shape de un API Key recién creado.
 * El campo `apiKey` (el token en texto plano) solo se incluye
 * en la respuesta de creación — nunca vuelve a ser visible.
 */
export interface ApiKeyResponseDto extends ApiKeyListDto {
  apiKey: string;
  updatedAt: Date;
}
