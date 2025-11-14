import { Request } from 'express';

/**
 * Interfaz extendida de Request para super admins
 */
export interface RequestWithSuperAdmin extends Request {
  superAdmin: {
    id: string;
    email: string;
    name: string;
    role: 'super_admin';
  };
}
