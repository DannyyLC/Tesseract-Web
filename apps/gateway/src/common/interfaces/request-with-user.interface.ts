import { Request } from 'express';
import { UserPayload } from '../types/user-payload.type';

/**
 * Request autenticado con JWT (usuario desde dashboard)
 *
 * Se usa en endpoints protegidos por JwtAuthGuard.
 * El usuario está autenticado con email/password.
 */
export interface RequestWithUser extends Request {
  user: UserPayload;
}
