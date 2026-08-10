import { PaginatedResponse } from '../../platform/api/api_response';

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
  /** Nombre del workflow enlazado. Viaja resuelto para no tener que cruzarlo en cliente. */
  workflowName: string;
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
}

/** Filtros y cursor que acepta el listado de API Keys */
export interface ApiKeysQuery {
  cursor?: string | null;
  action?: 'next' | 'prev' | null;
  pageSize?: number;
  /** Acota el listado a las keys de un workflow. */
  workflowId?: string;
  search?: string;
}

export type ApiKeysResponse = PaginatedResponse<ApiKeyListDto>;

/**
 * Shape de un API Key recién creado.
 * El campo `apiKey` (el token en texto plano) solo se incluye
 * en la respuesta de creación — nunca vuelve a ser visible.
 */
export interface ApiKeyResponseDto extends ApiKeyListDto {
  apiKey: string;
  updatedAt: Date;
}
