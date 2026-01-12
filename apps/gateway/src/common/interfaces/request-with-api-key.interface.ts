import { Request } from 'express';
import { ApiKeyPayload } from '../types/api-key-payload.type';

/**
 * Request autenticado con API Key
 *
 * Se usa en endpoints protegidos por ApiKeyGuard.
 * La autenticación viene desde x-api-key header.
 */
export interface RequestWithApiKey extends Request {
  apiKey: ApiKeyPayload;
}
