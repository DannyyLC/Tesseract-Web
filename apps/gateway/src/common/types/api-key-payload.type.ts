/**
 * Payload de una API Key autenticada
 *
 * Este payload se usa cuando una request viene con API key en el header.
 * Se inyecta en el request después de validar la API key.
 */
export interface ApiKeyPayload {
  apiKeyId: string; // ID de la API key
  apiKeyName: string; // Nombre de la API key (ej: "Production Web")
  organizationId: string; // ID de la organización dueña de la API key
  organizationName: string; // Nombre de la organización
  plan: string; // Plan de la organización
  workflowId: string; // ID del workflow asociado a esta API key
}
