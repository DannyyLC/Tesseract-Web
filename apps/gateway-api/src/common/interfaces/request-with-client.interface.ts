import { Request } from 'express';
import { ClientPayload } from '../types/client-payload.type';

/**
 * Extiende el Request de Express para incluir el cliente autenticado
 * 
 * Esto permite que TypeScript sepa que request.client existe
 */
export interface RequestWithClient extends Request {
  client: ClientPayload;
}